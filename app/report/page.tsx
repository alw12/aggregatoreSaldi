import Link from "next/link";
import { headers } from "next/headers";
import { Nav } from "@/app/nav";
import { psuHeadersFrom } from "@/lib/data";
import { hasStore, listSessions } from "@/lib/store";
import { loadMovements } from "@/lib/transactions";
import { listDebts } from "@/lib/debts";
import { loadCatOpts } from "@/lib/cat-store";
import { getBudget } from "@/lib/budget-store";
import { todayRome } from "@/lib/history";
import { CATEGORIES, type CatOpts } from "@/lib/categories";
import { monthReport, reportMonths, type MonthTotals } from "@/lib/report";
import { addMonths } from "@/lib/budget";
import type { Movement } from "@/lib/flows";

export const dynamic = "force-dynamic";

const eur0 = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(n);
const pct = (n: number) => new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 0 }).format(n);
const monthName = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("it-IT", { month: "long", year: "numeric", timeZone: "UTC" });
const monthShort = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("it-IT", { month: "long", timeZone: "UTC" });
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });

/** Variazione rispetto al mese prima: freccia, importo e percentuale; `good` dice se salire è un bene. */
function Delta({ now, before, good }: { now: number; before: number | null; good: "up" | "down" }) {
  if (before === null) return null;
  const d = now - before;
  if (Math.abs(d) < 0.5) return <span className="delta same">= come il mese prima</span>;
  const better = good === "up" ? d > 0 : d < 0;
  const rel = before > 0 ? ` (${d > 0 ? "+" : "−"}${pct(Math.abs(d) / before)})` : "";
  return (
    <span className={`delta ${better ? "better" : "worse"}`}>
      {d > 0 ? "▲" : "▼"} {eur0(Math.abs(d))}
      {rel}
    </span>
  );
}

function Tile({ label, k, t, prev, good }: { label: string; k: keyof MonthTotals; t: MonthTotals; prev: MonthTotals | null; good: "up" | "down" }) {
  const v = t[k] ?? 0;
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <span className={`tile-value${k === "saved" && v < 0 ? " neg" : ""}`}>{eur0(v)}</span>
      <span className="tile-sub">
        <Delta now={v} before={prev ? (prev[k] ?? 0) : null} good={good} />
      </span>
    </div>
  );
}

/** Report di un mese intero: entrate, uscite, risparmio e categorie, a confronto con il mese prima. */
export default async function ReportPage({ searchParams }: PageProps<"/report">) {
  const sp = await searchParams;
  let moves: Movement[] = [];
  let cat: CatOpts = {};
  let goal: number | null = null;
  let error: string | null = null;
  if (hasStore()) {
    try {
      if ((await listSessions()).length) moves = (await loadMovements(psuHeadersFrom(await headers()))).moves;
      const [debts, budget] = await Promise.all([listDebts(), getBudget()]);
      cat = await loadCatOpts(debts);
      goal = budget.goal;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  const today = todayRome();
  const months = reportMonths(moves, today);
  const month = typeof sp.mese === "string" && months.includes(sp.mese) ? sp.mese : months[0];
  const r = month ? monthReport(moves, month, today, cat, goal) : null;
  const max = r ? Math.max(...r.categories.map((c) => Math.max(c.total, c.prev ?? 0)), 0) : 0;

  return (
    <main className="container">
      <Nav current="/report" />
      <h1 className="page-title">Report del mese</h1>
      <p className="page-lead">Il mese intero a confronto con quello prima. Il 1° di ogni mese arriva anche come notifica.</p>

      {error && <div className="notice error">{error}</div>}

      {months.length > 1 && (
        <nav className="periods" aria-label="Mese">
          {months.slice(0, 6).map((m) => (
            <Link key={m} className="period" href={`/report?mese=${m}`} aria-current={m === month ? "page" : undefined}>
              {monthName(m)}
            </Link>
          ))}
        </nav>
      )}

      {!r ? (
        <div className="card empty">
          <p>Il primo report arriva dopo un mese intero di movimenti.</p>
        </div>
      ) : (
        <>
          <h2 className="report-month">{monthName(r.month)}</h2>
          <div className="tiles">
            <Tile label="Entrate" k="income" t={r.totals} prev={r.prev} good="up" />
            <Tile label="Uscite" k="spending" t={r.totals} prev={r.prev} good="down" />
            <Tile label="Risparmiati" k="saved" t={r.totals} prev={r.prev} good="up" />
          </div>
          <p className="chart-note report-line">
            {r.totals.rate !== null && <>Hai messo da parte il <strong>{pct(Math.max(0, r.totals.rate))}</strong> delle entrate. </>}
            {r.goal && (r.goal.reached ? <>✓ Obiettivo di {eur0(r.goal.amount)} raggiunto. </> : <>Obiettivo di {eur0(r.goal.amount)} mancato di {eur0(r.goal.amount - r.totals.saved)}. </>)}
            {r.totals.invested > 0 && <>Versati negli investimenti: {eur0(r.totals.invested)}. </>}
            {!r.prev && <>Il mese prima non è intero: niente confronto.</>}
          </p>

          <section className="card chart-card">
            <div className="chart-title">Per categoria</div>
            {r.prev && (
              <p className="chart-note">
                Barra piena: {monthShort(r.month)}; linea sottile: {monthShort(addMonths(r.month, -1))}.
              </p>
            )}
            <div className="rep-rows">
              {r.categories.map((c) => (
                <div key={c.key} className="rep-row">
                  <span className={`swatch c${c.color}`} aria-hidden />
                  <span className="rep-label">
                    {c.label}
                    <span className="rec-meta">
                      {c.count} {c.count === 1 ? "spesa" : "spese"}
                    </span>
                  </span>
                  <span className="rep-bars" aria-hidden>
                    <span className={`rep-now c${c.color}`} style={{ width: `${max ? Math.max(1.5, (c.total / max) * 100) : 0}%` }} />
                    {c.prev !== null && <span className="rep-prev" style={{ width: `${max ? (c.prev / max) * 100 : 0}%` }} />}
                  </span>
                  <span className="rep-figs">
                    <span className="amount">{eur0(c.total)}</span>
                    <Delta now={c.total} before={c.prev} good="down" />
                  </span>
                </div>
              ))}
            </div>
            <p className="chart-note" style={{ margin: "12px 0 0" }}>
              Categoria sbagliata? Correggila da <Link href="/movimenti">Movimenti</Link>: il report si aggiorna.
            </p>
          </section>

          {r.biggest.length > 0 && (
            <section className="card chart-card">
              <div className="chart-title">Le spese più grandi</div>
              <div className="tx-list">
                {r.biggest.map((b, i) => (
                  <div key={i} className="due">
                    <span className="due-date">{shortDate(b.date)}</span>
                    <span className="rec-main">
                      <span className="tx-party">{b.party}</span>
                      <span className="rec-meta">{CATEGORIES[b.category].label}</span>
                    </span>
                    <span className="due-amt">{eur0(b.amount)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}


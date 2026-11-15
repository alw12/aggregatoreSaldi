import Link from "next/link";
import { headers } from "next/headers";
import { Nav } from "@/app/nav";
import { TrendChart } from "@/app/trend-chart";
import { psuHeadersFrom } from "@/lib/data";
import { hasStore, listSessions } from "@/lib/store";
import { ASSET_CLASSES, byInstrument, loadPortfolio, type HoldingView } from "@/lib/portfolio";
import { loadBonds, type BondView } from "@/lib/bonds";
import { loadHistory, todayRome, type Snapshot } from "@/lib/history";
import { loadMovements } from "@/lib/transactions";
import { completeMonths } from "@/lib/budget";
import { summarize, typeColor, type InvRow } from "@/lib/investments";
import type { Movement } from "@/lib/flows";

export const dynamic = "force-dynamic";

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(n);
const eur0 = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(n);
const signed = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always", signDisplay: "always" }).format(n);
const pct = (n: number) => new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 1 }).format(n);
const pctSigned = (n: number) => new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 1, signDisplay: "always" }).format(n);
const monthName = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("it-IT", { month: "long", year: "numeric", timeZone: "UTC" });

function Gain({ gain, cost }: { gain: number | null; cost: number | null }) {
  if (gain === null || !cost) return null;
  return (
    <span className={`gain ${gain >= 0 ? "up" : "down"}`}>
      {signed(gain)} ({pctSigned(gain / cost)})
    </span>
  );
}

/** Tutti gli investimenti in una pagina di sola lettura: quanto valgono, quanto rendono, dove sono. */
export default async function InvestmentsPage() {
  let holdings: HoldingView[] = [];
  let bonds: BondView[] = [];
  let history: Snapshot[] = [];
  let moves: Movement[] = [];
  let error: string | null = null;
  if (hasStore()) {
    const psu = psuHeadersFrom(await headers());
    const [p, b, h, m] = await Promise.allSettled([
      loadPortfolio(),
      loadBonds(),
      loadHistory(),
      // Versamenti dai movimenti: cache di 6 ore, la banca si legge solo se è scaduta
      listSessions().then((s) => (s.length ? loadMovements(psu).then((r) => r.moves) : [])),
    ]);
    if (p.status === "fulfilled") holdings = p.value;
    else error = p.reason instanceof Error ? p.reason.message : String(p.reason);
    if (b.status === "fulfilled") bonds = b.value;
    if (h.status === "fulfilled") history = h.value;
    if (m.status === "fulfilled") moves = m.value;
  }

  const clsOf = new Map(holdings.map((h) => [h.id, h.cls]));
  const missing = new Set(holdings.filter((h) => h.value === null).map((h) => h.id));
  const rows: InvRow[] = [
    ...byInstrument(holdings).map((i) => ({
      key: `h-${i.id}`,
      name: i.name,
      type: ASSET_CLASSES[clsOf.get(i.id) ?? "altro"],
      where: i.brokers.join(" e "),
      value: missing.has(i.id) && i.value === 0 ? null : i.value,
      cost: i.cost,
    })),
    ...bonds.map((b) => ({
      key: `b-${b.id}`,
      name: b.name,
      type: "Buoni postali",
      where: `dal ${new Date(`${b.subscribedAt}T00:00:00Z`).toLocaleDateString("it-IT", { month: "short", year: "numeric", timeZone: "UTC" })}${b.valueSource === "stima" ? ", valore stimato" : ""}${b.matured ? ", scaduto" : ""}`,
      value: b.value,
      cost: b.capital,
    })),
  ].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const s = summarize(rows);

  // Andamento: valore investito dello storico giornaliero
  const points = history.filter((d) => d.invested > 0).map((d) => ({ date: d.date, value: d.invested }));
  // Versamenti: bonifici verso broker e buoni (i movimenti "messo da parte"), per mese
  const month = todayRome().slice(0, 7);
  const months = [...completeMonths(moves, month).slice(-3), month];
  const deposits = months.map((m) => ({
    month: m,
    total: moves.filter((x) => x.kind === "invest" && x.currency === "EUR" && x.date.slice(0, 7) === m).reduce((t, x) => t - x.amount, 0),
  }));
  const depositedFull = deposits.slice(0, -1);
  const avgDeposit = depositedFull.length ? depositedFull.reduce((t, d) => t + d.total, 0) / depositedFull.length : null;

  return (
    <main className="container">
      <Nav current="/investimenti" />
      <h1 className="page-title">Investimenti</h1>
      <p className="page-lead">
        ETF, azioni, crypto e buoni postali insieme. Per aggiungere o modificare usa <Link href="/portfolio">Portafoglio</Link> e{" "}
        <Link href="/buoni">Buoni</Link>.
      </p>

      {error && <div className="notice error">{error}</div>}

      {rows.length === 0 ? (
        !error && (
          <div className="card empty">
            <p>Nessun investimento registrato.</p>
            <Link className="btn btn-primary" href="/portfolio">Aggiungi una posizione</Link>
          </div>
        )
      ) : (
        <>
          <section className="inv-hero">
            <div className="hero-label">Valore oggi</div>
            <div className="inv-total amount">{eur(s.value)}</div>
            {s.gain !== null && s.cost !== null && (
              <div className="inv-gain">
                <Gain gain={s.gain} cost={s.cost} /> <span className="inv-muted">su {eur0(s.cost)} versati</span>
                {s.partial && <div className="inv-muted inv-small">Il guadagno conta solo le posizioni con prezzo di carico.</div>}
              </div>
            )}
          </section>

          {s.byType.length > 0 && (
            <section className="card chart-card">
              <div className="chart-title">Per tipo</div>
              <div className="alloc-bar" role="img" aria-label={s.byType.map((t) => `${t.type} ${pct(t.value / s.value)}`).join(", ")}>
                {s.byType.map((t) => (
                  <span key={t.type} className={`alloc-seg c${t.color}`} style={{ flexGrow: t.value / s.value }} title={`${t.type}: ${eur(t.value)}`} />
                ))}
              </div>
              <div className="alloc-legend">
                {s.byType.map((t) => (
                  <div key={t.type} className="alloc-item">
                    <span className={`swatch c${t.color}`} aria-hidden />
                    <span className="alloc-label">{t.type}</span>
                    <span className="alloc-pct">{pct(t.value / s.value)}</span>
                    <span className="alloc-value">{eur(t.value)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="card chart-card">
            <div className="chart-title">Posizioni</div>
            <div className="inv-list">
              {rows.map((r) => (
                <div key={r.key} className="inv-row">
                  <span className={`swatch c${typeColor(r.type)}`} aria-hidden />
                  <span className="inv-main">
                    <span className="inv-name">{r.name}</span>
                    <span className="inv-meta">
                      {r.type} · {r.where}
                    </span>
                  </span>
                  <span className="inv-figs">
                    {r.value === null ? <span className="inv-muted">prezzo non disponibile</span> : <span className="amount">{eur(r.value)}</span>}
                    {r.value !== null && r.cost !== null ? <Gain gain={r.value - r.cost} cost={r.cost} /> : r.value !== null && <span className="inv-muted inv-small">senza prezzo di carico</span>}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {points.length >= 2 && (
            <section className="card chart-card">
              <div className="chart-title">Andamento</div>
              <p className="chart-note">
                Valore investito giorno per giorno: sale anche quando versi, non solo quando rende. Dal {new Date(`${points[0].date}T00:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "UTC" })}:{" "}
                <strong>{signed(points.at(-1)!.value - points[0].value)}</strong>.
              </p>
              <TrendChart points={points} label="Valore investito" slot={2} />
            </section>
          )}

          {deposits.some((d) => d.total > 0) && (
            <section className="card chart-card">
              <div className="chart-title">Versamenti</div>
              <p className="chart-note">
                Bonifici verso broker e buoni dai conti collegati{avgDeposit !== null ? <>: in media <strong>{eur0(avgDeposit)} al mese</strong></> : ""}.
              </p>
              <div className="inv-list">
                {deposits
                  .slice()
                  .reverse()
                  .map((d) => (
                    <div key={d.month} className="inv-dep">
                      <span className="inv-name">
                        <span style={{ textTransform: "capitalize", display: "inline-block" }}>{monthName(d.month)}</span>
                        {d.month === month && <span className="inv-muted"> (finora)</span>}
                      </span>
                      <span className="amount">{eur(d.total)}</span>
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

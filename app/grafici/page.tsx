import Link from "next/link";
import { headers } from "next/headers";
import { after } from "next/server";
import { Nav } from "@/app/nav";
import { AllocationBar, HoldingBars, Meter, SplitChart } from "@/app/charts";
import { TrendChart } from "@/app/trend-chart";
import { psuHeadersFrom } from "@/lib/data";
import { hasStore } from "@/lib/store";
import { byAssetClass, byInstrument } from "@/lib/portfolio";
import { loadOverview, type Overview } from "@/lib/overview";
import { CATEGORIES } from "@/lib/beni";
import { recordSnapshot } from "@/lib/history";

export const dynamic = "force-dynamic";

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(n);
const signed = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always", signDisplay: "always" }).format(n);
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });

function Tile({ label, value, sub, neg }: { label: string; value: number; sub?: string; neg?: boolean }) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <span className={`tile-value${neg ? " neg" : ""}`}>{eur(value)}</span>
      {sub && <span className="tile-sub">{sub}</span>}
    </div>
  );
}

/** Andamento di una voce dello storico, se ci sono almeno due giorni. */
function Trend({ title, note, points, slot }: { title: string; note: string; points: { date: string; value: number }[]; slot: 1 | 2 | 3 | 4 | "debt" }) {
  return (
    <section className="card chart-card">
      <div className="chart-title">{title}</div>
      {points.length >= 2 ? (
        <>
          <p className="chart-note">{note} dal {shortDate(points[0].date)}.</p>
          <TrendChart points={points} label={title} slot={slot} />
        </>
      ) : (
        <p className="chart-note" style={{ marginBottom: 0 }}>Serve almeno un altro giorno di storico.</p>
      )}
    </section>
  );
}

/** Tutto in grafici: composizione, debiti, andamento nel tempo e ogni sezione dell'app. */
export default async function ChartsPage() {
  if (!hasStore()) {
    return (
      <main className="container">
        <Nav current="/grafici" />
        <div className="notice">Storage non configurato.</div>
      </main>
    );
  }

  let o: Overview;
  try {
    o = await loadOverview(psuHeadersFrom(await headers()));
  } catch (e) {
    return (
      <main className="container">
        <Nav current="/grafici" />
        <div className="notice error">{e instanceof Error ? e.message : String(e)}</div>
      </main>
    );
  }
  const t = o.totals;
  const assets = Math.max(0, t.cash) + t.holdings + t.bonds + t.beni;
  const liabilities = t.cards + t.debts;

  const accounts = [
    ...o.banks.flatMap((b) =>
      b.accounts
        .filter((a) => a.currency === "EUR" && a.amount !== null && a.amount > 0)
        .map((a) => ({ key: a.uid, label: `${b.bank}, ${a.label}`, value: a.amount ?? 0 })),
    ),
    ...o.manual.filter((a) => a.currency === "EUR" && a.amount > 0).map((a) => ({ key: a.id, label: a.name, value: a.amount })),
  ];
  const owed = [
    ...o.debts.map((d) => ({ key: `d-${d.id}`, label: d.name, value: d.amount })),
    ...o.cards.map((c) => ({ key: `c-${c.id}`, label: `Carta ${c.name}`, value: c.balance })),
  ];
  const beniByCat = CATEGORIES.map((c) => ({ key: c, label: c, value: o.beni.filter((p) => p.category === c).reduce((s, p) => s + p.value, 0) }));
  const snap = o.today;
  if (snap) after(() => recordSnapshot(snap));
  const days = o.days;
  const series = (f: (s: (typeof days)[number]) => number) => days.map((s) => ({ date: s.date, value: f(s) }));

  return (
    <main className="container">
      <Nav current="/grafici" />
      <h1 className="page-title">Grafici</h1>
      <p className="page-lead">Tutto quello che hai e tutto quello che devi, in un colpo d’occhio.</p>

      {o.failed > 0 && <div className="notice">{o.failed} conti non letti: esclusi dai grafici.</div>}

      <div className="tiles">
        <Tile label="Patrimonio netto" value={t.net} neg={t.net < 0} sub="come in Panoramica" />
        <Tile label="Con i beni" value={t.netWithBeni} neg={t.netWithBeni < 0} sub={`+ ${eur(t.beni)} di beni`} />
        <Tile label="Cosa possiedi" value={assets} sub="liquidità, investimenti, beni" />
        <Tile label="Cosa devi" value={-liabilities} neg={liabilities > 0} sub="debiti e carte" />
      </div>

      <section className="card chart-card">
        <div className="chart-title">Cosa possiedi</div>
        <p className="chart-note">Ogni voce ha lo stesso colore in tutta l’app.</p>
        <AllocationBar
          parts={[
            { key: "cash", label: "Liquidità", value: t.cash, slot: 1 },
            { key: "etf", label: "ETF e crypto", value: t.holdings, slot: 2 },
            { key: "bfp", label: "Buoni postali", value: t.bonds, slot: 3 },
            { key: "beni", label: "Beni", value: t.beni, slot: 4 },
          ]}
        />
      </section>

      {owed.some((r) => r.value > 0) && (
        <section className="card chart-card">
          <HoldingBars caption={`Cosa devi: ${eur(liabilities)}`} rows={owed} debt />
          {assets > 0 && (
            <p className="chart-note" style={{ margin: "12px 0 0" }}>
              I debiti valgono il {new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 0 }).format(liabilities / assets)} di
              quello che possiedi{t.cash > 0 ? `; la liquidità ne copre il ${new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 0 }).format(Math.min(1, t.cash / liabilities))}` : ""}.
            </p>
          )}
        </section>
      )}

      <h2 className="section-head">Nel tempo</h2>
      <Trend title="Patrimonio netto" note="Una fotografia al giorno" points={series((s) => s.total)} slot={1} />
      <div className="duo">
        <Trend title="Liquidità" note="Conti e contanti" points={series((s) => s.cash)} slot={1} />
        <Trend title="Investito" note="ETF, crypto e buoni" points={series((s) => s.invested)} slot={2} />
      </div>
      <Trend title="Debiti e carte" note="Quanto devi" points={series((s) => (s.debts ?? 0) + s.cards)} slot="debt" />
      {t.cash + t.invested > 0 && (
        <section className="card chart-card">
          <div className="chart-title">Investito e liquido</div>
          <SplitChart cash={t.cash} etf={t.holdings} bonds={t.bonds} />
          {days.length >= 2 && (
            <div className="split-sub">
              <p className="chart-note">Quota investita giorno per giorno.</p>
              <TrendChart
                points={days
                  .filter((s) => s.cash + s.invested > 0)
                  .map((s) => ({ date: s.date, value: Math.max(0, s.invested) / (Math.max(0, s.cash) + Math.max(0, s.invested)) }))}
                unit="pct"
                label="Quota investita"
                slot={2}
              />
            </div>
          )}
        </section>
      )}

      <h2 className="section-head">Saldi</h2>
      {accounts.length > 0 ? (
        <section className="card chart-card">
          <HoldingBars caption={`Liquidità per conto: ${eur(t.cash)}`} rows={accounts} slot={1} />
        </section>
      ) : (
        <p className="chart-note">Nessun conto con saldo positivo.</p>
      )}

      <h2 className="section-head">Investimenti</h2>
      {o.holdings.length > 0 && (
        <div className="duo">
          <section className="card chart-card">
            <HoldingBars
              caption={`Posizioni: ${eur(t.holdings)}`}
              rows={byInstrument(o.holdings).map((i) => ({ key: i.id, label: i.name, value: i.value }))}
              slot={2}
            />
            {t.holdingsGain !== null && t.holdingsCost && (
              <p className="chart-note" style={{ margin: "12px 0 0" }}>
                Guadagno sulle posizioni con prezzo di carico: <strong>{signed(t.holdingsGain)}</strong> su {eur(t.holdingsCost)} investiti.
              </p>
            )}
          </section>
          <section className="card chart-card">
            <HoldingBars
              caption="Per tipo"
              rows={byAssetClass(o.holdings).map((c) => ({ key: c.cls, label: c.label, value: c.value }))}
              slot={2}
            />
          </section>
        </div>
      )}
      {o.bonds.length > 0 && (
        <section className="card chart-card">
          <HoldingBars
            caption={`Buoni postali: ${eur(t.bonds)}`}
            rows={o.bonds.map((b) => ({ key: b.id, label: `${b.name} (${eur(b.capital)} sottoscritti)`, value: b.value }))}
            slot={3}
          />
        </section>
      )}
      {o.holdings.length === 0 && o.bonds.length === 0 && <p className="chart-note">Nessun investimento.</p>}

      <h2 className="section-head">Beni</h2>
      {o.beni.length > 0 ? (
        <div className="duo">
          <section className="card chart-card">
            <HoldingBars caption={`Per categoria: ${eur(t.beni)}`} rows={beniByCat} slot={4} />
          </section>
          <section className="card chart-card">
            <HoldingBars caption="I più preziosi" rows={o.beni.slice().sort((a, b) => b.value - a.value).slice(0, 6).map((p) => ({ key: p.id, label: p.name, value: p.value }))} slot={4} />
          </section>
        </div>
      ) : (
        <p className="chart-note">Nessun bene. <Link href="/beni">Aggiungine uno</Link>.</p>
      )}

      <h2 className="section-head">Carte di credito</h2>
      {o.cards.length > 0 ? (
        <section className="card bank">
          {o.cards.map((c) => (
            <div key={c.id} className="account" style={{ display: "block" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div className="account-label">{c.name}</div>
                <div className={`amount${c.balance > 0 ? " neg" : ""}`}>{eur(-c.balance)}</div>
              </div>
              {c.limit ? (
                <Meter used={c.balance} limit={c.limit} label={c.name} />
              ) : (
                <div className="account-iban">Nessun plafond impostato</div>
              )}
            </div>
          ))}
        </section>
      ) : (
        <p className="chart-note">Nessuna carta.</p>
      )}
    </main>
  );
}

import Link from "next/link";
import { headers } from "next/headers";
import { Nav } from "@/app/nav";
import { FlowChart, HoldingBars } from "@/app/charts";
import { psuHeadersFrom } from "@/lib/data";
import { hasStore, listSessions } from "@/lib/store";
import { loadMovements, type MovementsResult } from "@/lib/transactions";
import { averageMonth, monthlyFlows, topSpending, type Kind } from "@/lib/flows";
import { todayRome } from "@/lib/history";

export const dynamic = "force-dynamic";

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(n);
const eur0 = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(n);
const pct = (n: number) => new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 0 }).format(n);
const monthName = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("it-IT", { month: "long", year: "numeric", timeZone: "UTC" });
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });
const daysBefore = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const TAG: Partial<Record<Kind, string>> = { invest: "messo da parte", internal: "giroconto" };

/** Entrate e uscite dai conti collegati: quanto risparmi davvero ogni mese e dove vanno i soldi. */
export default async function MovementsPage() {
  let data: MovementsResult | null = null;
  let hasBanks = false;
  let error: string | null = null;
  if (hasStore()) {
    try {
      hasBanks = (await listSessions()).length > 0;
      if (hasBanks) data = await loadMovements(psuHeadersFrom(await headers()));
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  const today = todayRome();
  const flows = data ? monthlyFlows(data.moves) : [];
  const avg = averageMonth(flows, today.slice(0, 7));
  const since = daysBefore(today, 30);
  const top = data ? topSpending(data.moves, since) : [];

  return (
    <main className="container">
      <Nav current="/movimenti" />
      <h1 className="page-title">Movimenti</h1>
      <p className="page-lead">Entrate e uscite dei conti collegati negli ultimi mesi. I giroconti tra i tuoi conti non contano; i bonifici verso broker, buoni e salvadanai contano come soldi messi da parte, non come spese.</p>

      {error && <div className="notice error">{error}</div>}
      {!hasBanks && !error && (
        <div className="card empty">
          <p>I movimenti arrivano dalle banche collegate.</p>
          <Link className="btn btn-primary" href="/connect">Collega una banca</Link>
        </div>
      )}
      {data && data.errors.length > 0 && (
        <div className="notice">
          Non letti: {data.errors.join("; ")}. Se il consenso è vecchio, ricollega la banca da <Link href="/connect">Collega banca</Link> per dare accesso ai movimenti.
        </div>
      )}

      {data && data.moves.length > 0 && (
        <>
          {avg && (
            <div className="tiles">
              <div className="tile">
                <span className="tile-label">Entrate al mese</span>
                <span className="tile-value">{eur0(avg.income)}</span>
                <span className="tile-sub">media di {avg.months} {avg.months === 1 ? "mese" : "mesi"}</span>
              </div>
              <div className="tile">
                <span className="tile-label">Uscite al mese</span>
                <span className="tile-value">{eur0(avg.spending)}</span>
                <span className="tile-sub">esclusi i soldi messi da parte</span>
              </div>
              <div className="tile">
                <span className="tile-label">Risparmi al mese</span>
                <span className={`tile-value${avg.saved < 0 ? " neg" : ""}`}>{eur0(avg.saved)}</span>
                <span className="tile-sub">{avg.income > 0 ? `tasso di risparmio ${pct(avg.saved / avg.income)}` : "nessuna entrata"}</span>
              </div>
            </div>
          )}

          <section className="card chart-card">
            <div className="chart-title">Mese per mese</div>
            <p className="chart-note">Il mese in corso è parziale{flows.length > 1 ? " e il primo può esserlo" : ""}.</p>
            <FlowChart
              rows={flows
                .slice()
                .reverse()
                .map((f) => ({ key: f.month, label: monthName(f.month), income: f.income, spending: f.spending, invested: f.invested }))}
            />
            {avg && (
              <p className="chart-note" style={{ margin: "14px 0 0" }}>
                Con {eur0(Math.max(0, avg.saved))} al mese il simulatore in <Link href="/consigli">Verso il milione</Link> usa i tuoi numeri veri.
              </p>
            )}
          </section>

          {top.length > 0 && (
            <section className="card chart-card">
              <HoldingBars caption="Dove vanno i soldi, ultimi 30 giorni" rows={top.map((t) => ({ key: t.party, label: `${t.party}${t.count > 1 ? ` (${t.count})` : ""}`, value: t.total }))} slot={3} />
            </section>
          )}

          <section className="card chart-card">
            <div className="chart-title">Ultimi movimenti</div>
            <div className="tx-list">
              {data.moves.slice(0, 40).map((m) => (
                <div key={m.id} className="tx">
                  <span className="tx-party">
                    {m.party}
                    {TAG[m.kind] && <span className="tx-tag">{TAG[m.kind]}</span>}
                  </span>
                  <span className="tx-meta">{shortDate(m.date)}, {m.account}</span>
                  <span className={`tx-amount${m.amount > 0 ? " in" : ""}`}>{m.amount > 0 ? "+" : ""}{eur(m.amount)}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
      {data && data.moves.length === 0 && data.errors.length === 0 && <p className="chart-note">Nessun movimento negli ultimi mesi.</p>}
    </main>
  );
}

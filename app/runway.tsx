import type { ReactNode } from "react";
import type { Runway } from "@/lib/budget";

const eur0 = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(n);
const months1 = (n: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(n);

const MIN = 3;
const TARGET = 6;

/** Mesi di autonomia: cifra grande, barra fino a 6 mesi con le tacche a 3 e 6, quanto manca. */
export function RunwayCard({ r, link }: { r: Runway; link?: ReactNode }) {
  const state = r.months >= TARGET ? "ottimo" : r.months >= MIN ? "buono" : r.months >= 1 ? "da costruire" : "basso";
  const to = (m: number) => Math.max(0, m * r.monthly - r.available);
  return (
    <section className="card chart-card runway">
      <div className="chart-title">Mesi di autonomia</div>
      <div className="runway-figure">
        <span className="runway-value amount">{months1(r.months)}</span>
        <span className="runway-unit">{r.months >= 0.95 && r.months < 1.05 ? "mese" : "mesi"}</span>
        <span className={`runway-state ${state.replace(" ", "-")}`}>{state}</span>
      </div>
      <div className="runway-track" role="meter" aria-valuemin={0} aria-valuemax={TARGET} aria-valuenow={Math.min(TARGET, r.months)} aria-label="Mesi di autonomia">
        <span className="runway-fill" style={{ width: `${Math.min(1, r.months / TARGET) * 100}%` }} />
        <span className="runway-mark" style={{ left: `${(MIN / TARGET) * 100}%` }} aria-hidden />
      </div>
      <div className="runway-scale" aria-hidden>
        <span>0</span>
        <span style={{ left: `${(MIN / TARGET) * 100}%` }}>3 mesi</span>
        <span>6 mesi</span>
      </div>
      <p className="chart-note" style={{ margin: "12px 0 0" }}>
        Senza nessuna entrata, con <strong>{eur0(Math.max(0, r.available))}</strong> di liquidità (già tolte le carte) copri le spese di{" "}
        {months1(r.months)} {r.months >= 0.95 && r.months < 1.05 ? "mese" : "mesi"}: in media <strong>{eur0(r.monthly)} al mese</strong>, rate e affitto compresi, negli ultimi{" "}
        {r.basis === 1 ? "mese intero" : `${r.basis} mesi interi`}.{" "}
        {r.months < MIN
          ? <>Per arrivare a 3 mesi mancano <strong>{eur0(to(MIN))}</strong>, a 6 mesi {eur0(to(TARGET))}.</>
          : r.months < TARGET
            ? <>Sopra il minimo di 3 mesi; per arrivare a 6 mancano <strong>{eur0(to(TARGET))}</strong>.</>
            : <>Oltre i 6 mesi consigliati: il di più può lavorare negli investimenti.</>}
        {link}
      </p>
    </section>
  );
}

import type { Inflation, WealthImpact } from "@/lib/inflation";

const rate1 = (n: number) => `${new Intl.NumberFormat("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)}%`;
const pts = (n: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(n);
const eur0 = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(n);
const eurS = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always", signDisplay: "exceptZero" }).format(n);
const dayMonth = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "long", timeZone: "UTC" });
const monthName = (ym: string, opts: Intl.DateTimeFormatOptions = { month: "long", year: "numeric" }) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("it-IT", { ...opts, timeZone: "UTC" });

const TARGET = 2; // obiettivo BCE

/** Inflazione italiana: ultimo dato grande, variazione dal mese prima, barre degli ultimi 12 mesi con la linea al 2%. */
export function InflationCard({ inf, impact }: { inf: Inflation; impact: WealthImpact | null }) {
  const last = inf.series.at(-1)!;
  const prev = inf.series.at(-2);
  const bars = inf.series.slice(-12);
  const state = last.rate < 0 ? "deflazione" : last.rate <= 2.5 ? "nella norma" : last.rate <= 4 ? "alta" : "molto alta";
  const tone = last.rate < 0 || last.rate > 4 ? "basso" : last.rate > 2.5 ? "da-costruire" : "buono";
  const diff = prev ? Math.round((last.rate - prev.rate) * 10) / 10 : null;

  // Scala delle barre: da min(0, minimo) a max(obiettivo, massimo)
  const hi = Math.max(TARGET, ...bars.map((b) => b.rate));
  const lo = Math.min(0, ...bars.map((b) => b.rate));
  const span = hi - lo || 1;
  const y = (v: number) => ((hi - v) / span) * 100;

  return (
    <section className="card chart-card inflation">
      <div className="chart-title">Inflazione in Italia</div>
      <div className="runway-figure">
        <span className="infl-value">{rate1(last.rate)}</span>
        <span className="runway-unit">in un anno</span>
        <span className={`runway-state ${tone}`}>{state}</span>
      </div>
      <p className="chart-note">
        Prezzi di {monthName(last.month)} rispetto a un anno prima
        {diff !== null && (
          <>
            ,{" "}
            <span className={`infl-diff ${diff > 0 ? "worse" : diff < 0 ? "better" : "same"}`}>
              {diff === 0 ? "come" : <>{diff > 0 ? "▲" : "▼"} {pts(Math.abs(diff))} {Math.abs(diff) === 1 ? "punto" : "punti"} rispetto a</>} {monthName(prev!.month, { month: "long" })}
            </span>
          </>
        )}
        .
      </p>

      <div className="infl-bars" role="img" aria-label={`Inflazione annua degli ultimi ${bars.length} mesi, da ${rate1(bars[0].rate)} a ${rate1(last.rate)}`}>
        <span className="infl-target" style={{ top: `${y(TARGET)}%` }} aria-hidden>
          <span>2% BCE</span>
        </span>
        {bars.map((b, i) => (
          <span key={b.month} className="infl-col" title={`${monthName(b.month)}: ${rate1(b.rate)}`}>
            <span
              className={`infl-bar${i === bars.length - 1 ? " last" : ""}${b.rate > TARGET ? " over" : ""}`}
              style={{ top: `${y(Math.max(b.rate, 0))}%`, bottom: `${100 - y(Math.min(b.rate, 0))}%` }}
            />
          </span>
        ))}
      </div>
      <div className="infl-axis" aria-hidden>
        <span>{monthName(bars[0].month, { month: "short", year: "2-digit" })}</span>
        <span>{monthName(last.month, { month: "short", year: "2-digit" })}</span>
      </div>

      {inf.avg12 !== null && <p className="chart-note" style={{ margin: "10px 0 0" }}>Media degli ultimi 12 mesi {rate1(inf.avg12)}.</p>}

      {impact && last.rate > 0 && <WealthRows i={impact} />}

      <p className="infl-source">Fonte: Eurostat, indice IPCA calcolato da ISTAT.</p>
    </section>
  );
}

/** L'inflazione dell'ultimo anno sulle parti del patrimonio: cosa perde potere d'acquisto e cosa no. */
function WealthRows({ i }: { i: WealthImpact }) {
  const rows: { key: string; label: string; amount: number; effect: number; note: string }[] = [];
  if (i.cash.amount >= 1) rows.push({ key: "cash", label: "Liquidità", amount: i.cash.amount, effect: -i.cash.loss, note: "ferma sul conto, perde tutto l’effetto" });
  if (i.invested.amount >= 1)
    rows.push({ key: "inv", label: "Investimenti", amount: i.invested.amount, effect: -i.invested.loss, note: `per restare pari devono rendere più del ${rate1(i.rate)}` });
  if (i.debts.amount >= 1) rows.push({ key: "debts", label: "Debiti", amount: -i.debts.amount, effect: i.debts.gain, note: "pesano meno in termini reali, a tuo favore" });
  if (!rows.length) return null;

  return (
    <div className="infl-wealth">
      <div className="infl-wealth-title">Sul tuo patrimonio, in un anno</div>
      {rows.map((r) => (
        <div key={r.key} className="infl-row">
          <div>
            <div className="account-label">{r.label} <span className="infl-amt">{eur0(r.amount)}</span></div>
            <div className="account-iban">{r.note}</div>
          </div>
          <div className={`infl-amt infl-effect ${r.effect < 0 ? "worse" : "better"}`}>{eurS(r.effect)}</div>
        </div>
      ))}
      <div className="infl-row infl-total">
        <div>
          <div className="account-label">Patrimonio netto <span className="infl-amt">{eur0(i.net.amount)}</span></div>
          <div className="account-iban">se non rende nulla, fra un anno compra quanto {<span className="infl-amt">{eur0(i.net.amount - i.net.loss)}</span>} di oggi</div>
        </div>
        <div className={`infl-amt infl-effect ${i.net.loss > 0 ? "worse" : "better"}`}>{eurS(-i.net.loss)}</div>
      </div>
      {i.real && (
        <p className="chart-note" style={{ margin: "12px 0 0" }}>
          Dal {dayMonth(i.real.from)} il patrimonio netto è cambiato di <strong>{eurS(i.real.nominal)}</strong>; al netto dell’inflazione (fino a{" "}
          {monthName(i.real.toMonth, { month: "long" })}) di <strong>{eurS(i.real.real)}</strong>.
        </p>
      )}
    </div>
  );
}

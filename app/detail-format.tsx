/** Piccoli pezzi di testo condivisi dalle sezioni di dettaglio (Panoramica e Grafici). */

const signed = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always", signDisplay: "exceptZero" }).format(n);
const pctSigned = (n: number) => new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" }).format(n);

export const share = (n: number) => new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: n > 0 && n < 0.01 ? 1 : 0 }).format(n);
export const qty = (n: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 6 }).format(n);
export const longDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const years = (n: number) => (n === 1 ? "1 anno" : `${n} anni`);

/** Guadagno o perdita in euro e in percentuale sul costo, colorato (il segno lo dice comunque). */
export function Gain({ gain, cost }: { gain: number; cost: number | null }) {
  const dir = gain > 0.005 ? "up" : gain < -0.005 ? "down" : "";
  return (
    <span className={dir}>
      <span className="money">{signed(gain)}</span>
      {cost ? ` (${pctSigned(gain / cost)})` : ""}
    </span>
  );
}

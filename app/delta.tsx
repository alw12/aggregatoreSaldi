const eur0 = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(n);
const pct = (n: number) => new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 0 }).format(n);

/**
 * Variazione rispetto al periodo prima: freccia, importo e percentuale scritti (il colore li rinforza
 * soltanto). `good` dice se salire è un bene: per le spese no.
 */
export function Delta({ now, before, good, suffix }: { now: number; before: number | null; good: "up" | "down"; suffix?: string }) {
  if (before === null) return null;
  const d = now - before;
  if (Math.abs(d) < 0.5) return <span className="delta same">= {suffix ? suffix.replace(/^rispetto a/, "come") : "come prima"}</span>;
  const better = good === "up" ? d > 0 : d < 0;
  const rel = before > 0 ? ` (${d > 0 ? "+" : "−"}${pct(Math.abs(d) / before)})` : before === 0 && now > 0 ? " (nuova)" : "";
  return (
    <span className={`delta ${better ? "better" : "worse"}`}>
      {d > 0 ? "▲" : "▼"} {eur0(Math.abs(d))}
      {rel}
      {suffix ? ` ${suffix}` : ""}
    </span>
  );
}

/**
 * Grafici renderizzati sul server, in HTML/CSS: nessuna libreria, funzionano
 * anche senza JavaScript. Il tooltip è il `title` nativo di ogni segmento; i
 * valori sono comunque scritti accanto, quindi il colore non è mai l'unica
 * informazione.
 */

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(n);
const pct = (n: number) => new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 1 }).format(n);

export type Slot = 1 | 2 | 3 | 4;
export type Part = { key: string; label: string; value: number; slot: Slot };

/** Composizione del patrimonio: una barra impilata + legenda con importi e percentuali. */
export function AllocationBar({ parts }: { parts: Part[] }) {
  const shown = parts.filter((p) => p.value > 0);
  const sum = shown.reduce((s, p) => s + p.value, 0);
  if (sum <= 0) return null;
  return (
    <figure className="alloc" aria-label="Composizione del patrimonio">
      <div className="alloc-bar" role="img" aria-label={shown.map((p) => `${p.label} ${pct(p.value / sum)}`).join(", ")}>
        {shown.map((p) => (
          <span
            key={p.key}
            className={`alloc-seg s${p.slot}`}
            style={{ flexGrow: p.value / sum }}
            title={`${p.label}: ${eur(p.value)} (${pct(p.value / sum)})`}
          />
        ))}
      </div>
      <figcaption className="alloc-legend">
        {shown.map((p) => (
          <div key={p.key} className="alloc-item">
            <span className={`swatch s${p.slot}`} aria-hidden />
            <span className="alloc-label">{p.label}</span>
            <span className="alloc-pct">{pct(p.value / sum)}</span>
            <span className="alloc-value">{eur(p.value)}</span>
          </div>
        ))}
      </figcaption>
    </figure>
  );
}

export type BarRow = { key: string; label: string; value: number };

/**
 * Barre orizzontali ordinate per valore, con l'importo scritto a fine barra.
 * `slot` dà alle barre il colore della voce che rappresentano (es. 4 = beni); `debt` il rosso dei debiti.
 */
export function HoldingBars({ rows, caption, slot = 1, debt = false }: { rows: BarRow[]; caption: string; slot?: Slot; debt?: boolean }) {
  const sorted = rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const max = sorted[0]?.value ?? 0;
  const total = sorted.reduce((s, r) => s + r.value, 0);
  if (max <= 0) return null;
  return (
    <figure className={`hbars slot${slot}${debt ? " debt" : ""}`}>
      <figcaption className="chart-title">{caption}</figcaption>
      {sorted.map((r) => (
        <div key={r.key} className="hbar" title={`${r.label}: ${eur(r.value)} (${pct(r.value / total)})`}>
          <span className="hbar-label">{r.label}</span>
          <span className="hbar-track">
            <span className="hbar-fill" style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%` }} />
          </span>
          <span className="hbar-value">{eur(r.value)}</span>
        </div>
      ))}
    </figure>
  );
}

/** Quanto plafond è usato: una traccia con il riempimento. */
export function Meter({ used, limit, label }: { used: number; limit: number; label: string }) {
  const ratio = Math.min(1, Math.max(0, used / limit));
  const high = ratio >= 0.9;
  return (
    <div className="meter" title={`${label}: ${eur(used)} di ${eur(limit)}`}>
      <div className="meter-track" role="meter" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used} aria-label={label}>
        <span className={`meter-fill${high ? " high" : ""}`} style={{ width: `${ratio * 100}%` }} />
      </div>
      <div className="meter-text">
        {pct(ratio)} del plafond{high && <strong> · quasi al limite</strong>}
      </div>
    </div>
  );
}

/**
 * Liquido contro investito. L'investito resta diviso nei suoi due colori
 * (ETF e crypto, buoni) come nella composizione, con una graffa sotto che li
 * raggruppa: il colore segue sempre la stessa voce in tutta la pagina.
 */
export function SplitChart({ cash, etf, bonds }: { cash: number; etf: number; bonds: number }) {
  const c = Math.max(0, cash);
  const e = Math.max(0, etf);
  const b = Math.max(0, bonds);
  const invested = e + b;
  const sum = c + invested;
  if (sum <= 0) return null;
  const segs = [
    { key: "cash", value: c, slot: 1, label: "Liquidità" },
    { key: "etf", value: e, slot: 2, label: "ETF e crypto" },
    { key: "bfp", value: b, slot: 3, label: "Buoni postali" },
  ].filter((s) => s.value > 0);
  return (
    <figure className="alloc" aria-label={`Liquido ${pct(c / sum)}, investito ${pct(invested / sum)}`}>
      <div className="split-figures">
        <div className="split-fig">
          <span className="split-name"><span className="swatch s1" aria-hidden />Liquido</span>
          <span className="split-pct">{pct(c / sum)}</span>
          <span className="split-amt">{eur(c)}</span>
        </div>
        <div className="split-fig right">
          <span className="split-name">
            Investito
            <span aria-hidden style={{ display: "inline-flex", gap: 2 }}>
              {e > 0 && <span className="swatch s2" />}
              {b > 0 && <span className="swatch s3" />}
            </span>
          </span>
          <span className="split-pct">{pct(invested / sum)}</span>
          <span className="split-amt">{eur(invested)}</span>
        </div>
      </div>
      <div className="split-bar" aria-hidden>
        {segs.map((s) => (
          <span key={s.key} className={`s${s.slot}`} style={{ flexGrow: s.value / sum }} title={`${s.label}: ${eur(s.value)} (${pct(s.value / sum)})`} />
        ))}
      </div>
      <div className="split-groups" aria-hidden>
        {c > 0 && <span style={{ flexGrow: c / sum }}>Liquido</span>}
        {invested > 0 && (
          <span style={{ flexGrow: invested / sum }}>
            {e > 0 && b > 0 ? `ETF e crypto ${pct(e / sum)}, buoni ${pct(b / sum)}` : e > 0 ? "ETF e crypto" : "Buoni postali"}
          </span>
        )}
      </div>
    </figure>
  );
}

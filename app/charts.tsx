/**
 * Grafici renderizzati sul server, in HTML/CSS: nessuna libreria, funzionano
 * anche senza JavaScript. Il tooltip è il `title` nativo di ogni segmento; i
 * valori sono comunque scritti accanto, quindi il colore non è mai l'unica
 * informazione.
 */

import type { ReactNode } from "react";

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

export type BarRow = { key: string; label: string; value: number; sub?: ReactNode };

/**
 * Barre orizzontali ordinate per valore, con l'importo scritto a fine barra e sotto la quota sul totale.
 * `sub` aggiunge una riga di dettaglio sotto il nome (quote, guadagno, data…).
 * `slot` dà alle barre il colore della voce che rappresentano (es. 4 = beni); `debt` il rosso dei debiti.
 */
export function HoldingBars({ rows, caption, note, slot = 1, debt = false }: { rows: BarRow[]; caption: string; note?: ReactNode; slot?: Slot; debt?: boolean }) {
  const sorted = rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const max = sorted[0]?.value ?? 0;
  const total = sorted.reduce((s, r) => s + r.value, 0);
  if (max <= 0) return null;
  return (
    <figure className={`hbars slot${slot}${debt ? " debt" : ""}`}>
      <figcaption>
        <div className="chart-title">{caption}</div>
        {note && <p className="chart-note" style={{ margin: "2px 0 0" }}>{note}</p>}
      </figcaption>
      {sorted.map((r) => (
        <div key={r.key} className="hbar" title={`${r.label}: ${eur(r.value)} (${pct(r.value / total)})`}>
          <span className="hbar-label">
            {r.label}
            {r.sub && <span className="hbar-sub">{r.sub}</span>}
          </span>
          <span className="hbar-value">
            {eur(r.value)}
            {sorted.length > 1 && <span className="hbar-pct">{pct(r.value / total)}</span>}
          </span>
          <span className="hbar-track">
            <span className="hbar-fill" style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%` }} />
          </span>
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
 * Liquido contro investito: le due cifre grandi, la barra e sotto una legenda con ogni voce
 * (importo e quota del totale). L'investito resta diviso nei suoi colori (ETF e crypto, buoni)
 * come nella composizione: il colore segue sempre la stessa voce in tutta l'app.
 */
export function SplitChart({ cash, etf, bonds }: { cash: number; etf: number; bonds: number }) {
  const c = Math.max(0, cash);
  const e = Math.max(0, etf);
  const b = Math.max(0, bonds);
  const invested = e + b;
  const sum = c + invested;
  if (sum <= 0) return null;
  const segs = [
    { key: "cash", value: c, slot: 1, label: "Liquidità", group: "Liquido" },
    { key: "etf", value: e, slot: 2, label: "ETF e crypto", group: "Investito" },
    { key: "bfp", value: b, slot: 3, label: "Buoni postali", group: "Investito" },
  ].filter((s) => s.value > 0);
  return (
    <figure className="alloc" aria-label={`Liquido ${pct(c / sum)}, investito ${pct(invested / sum)}`}>
      <div className="split-figures">
        <div className="split-fig">
          <span className="split-name">Liquido</span>
          <span className="split-pct">{pct(c / sum)}</span>
          <span className="split-amt">{eur(c)}</span>
        </div>
        <div className="split-fig right">
          <span className="split-name">Investito</span>
          <span className="split-pct">{pct(invested / sum)}</span>
          <span className="split-amt">{eur(invested)}</span>
        </div>
      </div>
      <div className="split-bar" aria-hidden>
        {segs.map((s) => (
          <span key={s.key} className={`s${s.slot}`} style={{ flexGrow: s.value / sum }} title={`${s.label}: ${eur(s.value)} (${pct(s.value / sum)})`} />
        ))}
      </div>
      <figcaption className="alloc-legend">
        {segs.map((s) => (
          <div key={s.key} className="alloc-item">
            <span className={`swatch s${s.slot}`} aria-hidden />
            <span className="alloc-label">
              {s.label}
              {s.group === "Investito" && <span className="split-tag">investito</span>}
            </span>
            <span className="alloc-pct">{pct(s.value / sum)}</span>
            <span className="alloc-value">{eur(s.value)}</span>
          </div>
        ))}
      </figcaption>
    </figure>
  );
}

export type FlowRow = { key: string; label: string; income: number; spending: number; invested: number };

/** Entrate, uscite e investito mese per mese: barre affiancate sulla stessa scala, importi scritti. */
export function FlowChart({ rows }: { rows: FlowRow[] }) {
  const max = Math.max(0, ...rows.flatMap((r) => [r.income, r.spending, r.invested]));
  if (max <= 0) return null;
  const series = [
    { k: "income", label: "Entrate", slot: 1 },
    { k: "spending", label: "Uscite", slot: 3 },
    { k: "invested", label: "Messo da parte", slot: 2 },
  ] as const;
  const shown = series.filter((s) => rows.some((r) => r[s.k] > 0));
  return (
    <figure className="flows">
      <div className="flow-legend">
        {shown.map((s) => (
          <span key={s.k}><span className={`swatch s${s.slot}`} aria-hidden />{s.label}</span>
        ))}
      </div>
      {rows.map((r) => (
        <div key={r.key} className="flow-month">
          <div className="flow-label">{r.label}</div>
          {shown.map((s) => (
            <div key={s.k} className="flow-row" title={`${s.label} ${r.label}: ${eur(r[s.k])}`}>
              <span className="flow-track">
                <span className={`flow-fill s${s.slot}`} style={{ width: `${r[s.k] > 0 ? Math.max(1.5, (r[s.k] / max) * 100) : 0}%` }} />
              </span>
              <span className="flow-value">{eur(r[s.k])}</span>
            </div>
          ))}
        </div>
      ))}
    </figure>
  );
}

export type PiePart = { key: string; label: string; value: number; color: number; detail?: ReactNode; sub?: ReactNode };

/**
 * Torta (ad anello) con il totale al centro e accanto la legenda con importo e percentuale di ogni
 * fetta: i valori sono sempre scritti, il colore non è l'unica informazione. `color` 1…8 = --c1…--c8,
 * 0 = grigio (per "Altro"). Con `detail` la riga della legenda si apre e mostra cosa c'è dentro.
 */
export function PieChart({ parts, caption, center }: { parts: PiePart[]; caption?: string; center: string }) {
  const shown = parts.filter((p) => p.value > 0);
  const sum = shown.reduce((s, p) => s + p.value, 0);
  if (sum <= 0) return null;
  // pathLength 100: lunghezze in percentuale; 0,8 di spazio tra le fette (~2px)
  const gap = shown.length > 1 ? 0.8 : 0;
  const shares = shown.map((p) => (p.value / sum) * 100);
  const arcs = shown.map((p, i) => ({
    ...p,
    start: shares.slice(0, i).reduce((s, x) => s + x, 0),
    len: Math.max(0.3, shares[i] - gap),
  }));
  return (
    <figure className="pie">
      {caption && <figcaption className="chart-title">{caption}</figcaption>}
      <div className="pie-body">
        <svg className="pie-svg" viewBox="0 0 120 120" role="img" aria-label={arcs.map((a) => `${a.label} ${pct(a.value / sum)}`).join(", ")}>
          <circle cx="60" cy="60" r="46" className="pie-track" />
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx="60"
              cy="60"
              r="46"
              pathLength={100}
              className={`pie-arc c${a.color}`}
              strokeDasharray={`${a.len} ${100 - a.len}`}
              strokeDashoffset={-a.start}
              transform="rotate(-90 60 60)"
            >
              <title>{`${a.label}: ${eur(a.value)} (${pct(a.value / sum)})`}</title>
            </circle>
          ))}
          <text x="60" y="57" className="pie-total">{center}</text>
          <text x="60" y="72" className="pie-sub">in tutto</text>
        </svg>
        <div className="pie-legend">
          {arcs.map((a) => {
            const row = (
              <>
                <span className={`swatch c${a.color}`} aria-hidden />
                <span className="alloc-label">
                  {a.label}
                  {a.sub && <span className="pie-sub-line">{a.sub}</span>}
                </span>
                <span className="alloc-pct">{pct(a.value / sum)}</span>
                <span className="alloc-value">{eur(a.value)}</span>
              </>
            );
            return a.detail ? (
              <details key={a.key} className="pie-item">
                <summary className="alloc-item">{row}</summary>
                <div className="pie-detail">{a.detail}</div>
              </details>
            ) : (
              <div key={a.key} className="pie-item alloc-item">{row}</div>
            );
          })}
        </div>
      </div>
    </figure>
  );
}

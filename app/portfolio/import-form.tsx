"use client";

import { useMemo, useState } from "react";
import { parsePositions } from "@/lib/import";

const num = (n: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 6 }).format(n);
const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 4 }).format(n);

/** Incolla un elenco di posizioni: anteprima immediata, poi un solo invio al server che le salva tutte. */
export function ImportForm({ brokers, defaultBroker }: { brokers: readonly string[]; defaultBroker: string }) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const parsed = useMemo(() => parsePositions(text), [text]);
  const n = parsed.positions.length;

  return (
    <details className="card group import">
      <summary>
        <div>
          <div className="bank-name">Importa un elenco di posizioni</div>
          <div className="bank-meta">Incolla da Trade Republic, da un foglio di calcolo o scritto a mano</div>
        </div>
      </summary>
      <form className="form-grid import-body" method="post" action="/api/portfolio">
        <input type="hidden" name="action" value="import" />
        <input type="hidden" name="positions" value={JSON.stringify(parsed.positions)} />
        <label>
          Broker
          <select name="broker" defaultValue={defaultBroker}>
            {brokers.map((b) => <option key={b}>{b}</option>)}
          </select>
        </label>
        <label>
          Una posizione per riga: ISIN, quote e (se vuoi) prezzo medio di carico
          <textarea
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"IE00B4L5Y983  2,5  98,40\nIE00B6R52259; 0,315; 111,06\nBTC  0,0002"}
            spellCheck={false}
          />
        </label>
        <p className="form-hint">Va bene qualsiasi separatore: tab, punto e virgola o spazi. Le crypto di Trade Republic (ISIN XF000BTC0017) diventano BTC-EUR.</p>
        <fieldset className="choice">
          <label><input type="radio" name="mode" value="merge" checked={mode === "merge"} onChange={() => setMode("merge")} /> Aggiungi o aggiorna queste, lascia le altre</label>
          <label><input type="radio" name="mode" value="replace" checked={mode === "replace"} onChange={() => setMode("replace")} /> Sostituisci tutto il portafoglio del broker (le posizioni non in elenco vengono tolte)</label>
        </fieldset>
        {n > 0 && (
          <table className="scenarios">
            <thead>
              <tr><th scope="col">Strumento</th><th scope="col">Quote</th><th scope="col">Prezzo medio</th></tr>
            </thead>
            <tbody>
              {parsed.positions.map((p) => (
                <tr key={p.id}>
                  <td>{p.id}{p.name ? <span className="tx-tag">{p.name}</span> : null}</td>
                  <td>{num(p.qty)}</td>
                  <td>{p.avgCost !== null ? eur(p.avgCost) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {parsed.skipped.length > 0 && (
          <p className="form-hint">Righe ignorate (senza ISIN o quote): {parsed.skipped.slice(0, 3).join(" · ")}{parsed.skipped.length > 3 ? ` e altre ${parsed.skipped.length - 3}` : ""}</p>
        )}
        <button className="btn btn-primary" type="submit" disabled={n === 0}>
          {n === 0 ? "Incolla almeno una posizione" : `Importa ${n} ${n === 1 ? "posizione" : "posizioni"}`}
        </button>
      </form>
    </details>
  );
}

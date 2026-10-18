import { parseNumber } from "./parse";

/** Riga riconosciuta in un elenco di posizioni incollato (da Trade Republic, un foglio di calcolo, a mano). */
export type ImportedPosition = { id: string; name: string | null; qty: number; avgCost: number | null };
export type ImportResult = { positions: ImportedPosition[]; skipped: string[] };

const ISIN = /\b[A-Z]{2}[A-Z0-9]{9}\d\b/;
const CRYPTO = /^(BTC|ETH|SOL|XRP|ADA)(-EUR)?$/i;
// Trade Republic usa ISIN fittizi per le crypto: li riportiamo ai simboli con prezzo
const TR_CRYPTO: Record<string, string> = { XF000BTC0017: "BTC-EUR", XF000ETH0019: "ETH-EUR" };
const NUMERIC = /^-?[\d.,]+\s*(€|EUR)?$/i;

function fields(line: string): string[] {
  const sep = /\t|;|\|/.test(line) ? /\s*(?:\t|;|\|)\s*/ : /\s+/;
  return line.split(sep).map((f) => f.trim()).filter(Boolean);
}

function idOf(field: string): string | null {
  const f = field.toUpperCase();
  const isin = f.match(ISIN)?.[0];
  if (isin && isin.length === f.length) return TR_CRYPTO[isin] ?? isin;
  const c = f.match(CRYPTO);
  return c ? `${c[1]}-EUR` : null;
}

/**
 * Legge un elenco "ISIN quantità [prezzo medio]", una posizione per riga, con campi separati da
 * tab, punto e virgola, barra verticale o spazi. Il nome, se c'è, è il testo che resta.
 * Lo stesso strumento su più righe viene sommato, con il prezzo medio ponderato.
 */
export function parsePositions(text: string): ImportResult {
  const byId = new Map<string, ImportedPosition & { costQty: number; costSum: number }>();
  const skipped: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = fields(line);
    let id: string | null = null;
    const nums: number[] = [];
    const words: string[] = [];
    for (const p of parts) {
      const asId: string | null = id ? null : idOf(p);
      if (asId) {
        id = asId;
        continue;
      }
      const n = NUMERIC.test(p) ? parseNumber(p) : null;
      if (n !== null && !Number.isNaN(n)) nums.push(n);
      else words.push(p);
    }
    const [qty, avgCost] = nums;
    if (!id || qty === undefined || !(qty > 0)) {
      // Intestazioni ("ISIN;Quantità;…") e righe senza quantità: le segnaliamo ma non bloccano
      skipped.push(line);
      continue;
    }
    const cost = avgCost !== undefined && avgCost > 0 ? avgCost : null;
    const cur = byId.get(id) ?? { id, name: null, qty: 0, avgCost: null, costQty: 0, costSum: 0 };
    cur.qty += qty;
    if (cost !== null) {
      cur.costQty += qty;
      cur.costSum += qty * cost;
    }
    cur.name ??= words.join(" ").slice(0, 120) || null;
    byId.set(id, cur);
  }
  const positions = [...byId.values()].map(({ costQty, costSum, ...p }) => ({
    ...p,
    // Prezzo medio solo se noto per tutte le quote, altrimenti sarebbe falsato
    avgCost: costQty > 0 && Math.abs(costQty - p.qty) < 1e-9 ? costSum / costQty : null,
  }));
  return { positions, skipped };
}

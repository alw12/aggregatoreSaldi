/** Riepilogo di tutti gli investimenti (ETF, azioni, crypto, buoni): logica pura (testata in investments.test.ts). */

export type InvRow = {
  key: string;
  name: string;
  type: string; // Azioni, Crypto, Buoni postali…
  where: string; // broker o "dal 2023"
  value: number | null; // null = prezzo non disponibile
  cost: number | null; // versato; null = prezzo di carico sconosciuto
};

/** Un colore fisso per tipo (--c1…--c8, 0 = grigio): lo stesso nella barra e nell'elenco. */
export const TYPE_COLOR: Record<string, number> = {
  Azioni: 1,
  "Materie prime": 2,
  "Buoni postali": 3,
  Oro: 4,
  Crypto: 5,
  Obbligazioni: 7,
  Altro: 0,
};
export const typeColor = (t: string) => TYPE_COLOR[t] ?? 0;

export type InvSummary = {
  value: number;
  cost: number | null; // solo le righe con valore e versato noti
  gain: number | null;
  partial: boolean; // qualche riga senza versato o senza prezzo: il guadagno non le comprende
  byType: { type: string; color: number; value: number }[];
};

export function summarize(rows: InvRow[]): InvSummary {
  const value = rows.reduce((s, r) => s + (r.value ?? 0), 0);
  const known = rows.filter((r) => r.value !== null && r.cost !== null);
  const cost = known.reduce((s, r) => s + r.cost!, 0);
  const types = new Map<string, number>();
  for (const r of rows) if (r.value) types.set(r.type, (types.get(r.type) ?? 0) + r.value);
  return {
    value,
    cost: known.length ? cost : null,
    gain: known.length ? known.reduce((s, r) => s + r.value!, 0) - cost : null,
    partial: known.length < rows.length,
    byType: [...types].map(([type, v]) => ({ type, color: typeColor(type), value: v })).filter((t) => t.value > 0).sort((a, b) => b.value - a.value),
  };
}

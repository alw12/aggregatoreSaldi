/** Inflazione da Eurostat (JSON-stat di prc_hicp_minr) e il suo effetto sul patrimonio: logica pura, testata in inflation.test.ts. */

export type InflationPoint = { month: string; rate: number };

export type Inflation = {
  /** Variazione annua dell'IPCA, mese per mese, dal più vecchio. */
  series: InflationPoint[];
  /** Media dei 12 mesi (tasso medio annuo), se Eurostat la dà per l'ultimo mese. */
  avg12: number | null;
  /** Livello dell'indice (2025 = 100) per mese: serve a riportare un importo passato ai prezzi di oggi. */
  index: { month: string; value: number }[];
  updated: string | null;
};

type JsonStat = {
  id: string[];
  size: number[];
  value: Record<string, number>;
  updated?: string;
  dimension: Record<string, { category: { index: Record<string, number> } }>;
};

/** Estrae RCH_A (variazione annua), RCH_MV12MAVR (media 12 mesi) e I25 (indice 2025 = 100). */
export function parseHicp(d: JsonStat): Inflation {
  const tIdx = d.id.indexOf("time");
  const uIdx = d.id.indexOf("unit");
  if (tIdx === -1 || uIdx === -1) throw new Error("Risposta Eurostat senza tempo o unità");
  const units = d.dimension.unit.category.index;
  const times = Object.entries(d.dimension.time.category.index).sort((a, b) => a[1] - b[1]).map(([t]) => t);

  // Posizione piatta in JSON-stat: indici di ogni dimensione per i "passi" delle successive
  const strides = d.size.map((_, i) => d.size.slice(i + 1).reduce((a, b) => a * b, 1));
  const at = (unit: string, t: number): number | null => {
    const u = units[unit];
    if (u === undefined) return null;
    const v = d.value[String(u * strides[uIdx] + t * strides[tIdx])];
    return typeof v === "number" ? v : null;
  };
  const column = (unit: string) =>
    times.flatMap((month, t) => {
      const v = at(unit, t);
      return v === null ? [] : [{ month, v }];
    });

  const series = column("RCH_A").map(({ month, v }) => ({ month, rate: v }));
  const index = column("I25").map(({ month, v }) => ({ month, value: v }));
  const last = series.at(-1);
  const avg12 = last ? at("RCH_MV12MAVR", times.indexOf(last.month)) : null;
  return { series, avg12, index, updated: d.updated ?? null };
}

/** Potere d'acquisto perso in un anno da un importo fermo, con i prezzi che salgono del `rate`%. */
export const yearlyLoss = (amount: number, rate: number) => amount - amount / (1 + rate / 100);

export type WealthImpact = {
  rate: number;
  /** Liquidità al netto delle carte: ferma sul conto, perde tutto l'effetto. */
  cash: { amount: number; loss: number };
  /** ETF, crypto e buoni: il rendimento che serve solo per restare pari. */
  invested: { amount: number; loss: number };
  /** I debiti pesano meno in termini reali: a tuo favore. */
  debts: { amount: number; gain: number };
  /** Patrimonio netto: liquidità + investito − debiti. */
  net: { amount: number; loss: number };
  /** Variazione dalla prima fotografia, in euro e ai prezzi dell'ultimo mese pubblicato. */
  real: { from: string; nominal: number; real: number; toMonth: string } | null;
};

type Wealth = { cash: number; cards: number; invested: number; debts: number; net: number };
type Day = { date: string; total: number };

/** L'inflazione dell'ultimo anno applicata alle parti del patrimonio e allo storico. */
export function wealthImpact(inf: Inflation, w: Wealth, days: Day[]): WealthImpact | null {
  const last = inf.series.at(-1);
  if (!last) return null;
  const r = last.rate;
  const cash = Math.max(0, w.cash - w.cards);

  // Dalla prima fotografia: il netto di allora riportato ai prezzi dell'ultimo mese pubblicato
  let real: WealthImpact["real"] = null;
  const first = days[0];
  const now = days.at(-1);
  const idx = (m: string) => inf.index.find((p) => p.month === m)?.value;
  const lastIdx = inf.index.at(-1);
  if (first && now && first !== now && lastIdx) {
    const fromIdx = idx(first.date.slice(0, 7));
    if (fromIdx && first.date.slice(0, 7) < lastIdx.month) {
      const then = first.total * (lastIdx.value / fromIdx);
      real = { from: first.date, nominal: now.total - first.total, real: now.total - then, toMonth: lastIdx.month };
    }
  }

  return {
    rate: r,
    cash: { amount: cash, loss: yearlyLoss(cash, r) },
    invested: { amount: w.invested, loss: yearlyLoss(w.invested, r) },
    debts: { amount: w.debts, gain: yearlyLoss(w.debts, r) },
    net: { amount: w.net, loss: yearlyLoss(w.net, r) },
    real,
  };
}

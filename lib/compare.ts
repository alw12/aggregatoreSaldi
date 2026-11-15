/** Spese per categoria a confronto con il periodo prima: logica pura (testata in compare.test.ts). */

import type { Movement } from "./flows";
import { spendingByCategory, type CatOpts, type CategoryKey } from "./categories";
import { addMonths, daysInMonth } from "./budget";

const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("it-IT", { month: "long", timeZone: "UTC" });

export type PrevPeriod = { from: string; to: string; label: string };

/**
 * Il periodo con cui confrontare: per il mese in corso lo stesso tratto del mese prima (1-15 contro
 * 1-15), per un mese passato il mese prima intero, per gli ultimi 30 giorni i 30 prima.
 * null se i movimenti letti non coprono tutto il periodo prima (la banca dà 90-120 giorni).
 */
export function previousPeriod(period: string, today: string, moves: Movement[]): PrevPeriod | null {
  const dates = moves.filter((m) => m.currency === "EUR" && m.kind !== "internal").map((m) => m.date);
  if (!dates.length) return null;
  const first = dates.reduce((a, b) => (a < b ? a : b));
  let p: PrevPeriod;
  if (period === "30") {
    p = { from: shift(today, -61), to: shift(today, -31), label: "rispetto ai 30 giorni prima" };
  } else {
    const prev = addMonths(period, -1);
    if (period === today.slice(0, 7)) {
      const d = Math.min(Number(today.slice(8, 10)), daysInMonth(prev));
      p = { from: `${prev}-01`, to: `${prev}-${String(d).padStart(2, "0")}`, label: `rispetto a ${monthLabel(prev)} fino al ${d}` };
    } else {
      p = { from: `${prev}-01`, to: `${prev}-${String(daysInMonth(prev)).padStart(2, "0")}`, label: `rispetto a ${monthLabel(prev)}` };
    }
  }
  return first <= p.from ? p : null;
}

export type CategoryChange = { key: CategoryKey; label: string; now: number; before: number; delta: number };

/** Spesa per categoria ora e nel periodo prima, con la differenza; anche le categorie sparite (ora 0). */
export function compareCategories(moves: Movement[], from: string, to: string, prev: PrevPeriod, cat: CatOpts = {}): CategoryChange[] {
  const now = spendingByCategory(moves, from, to, cat);
  const before = new Map(spendingByCategory(moves, prev.from, prev.to, cat).map((c) => [c.key, c]));
  const out: CategoryChange[] = now.map((c) => {
    const b = before.get(c.key)?.total ?? 0;
    return { key: c.key, label: c.label, now: c.total, before: b, delta: c.total - b };
  });
  for (const [key, b] of before) if (!out.some((c) => c.key === key)) out.push({ key, label: b.label, now: 0, before: b.total, delta: -b.total });
  return out;
}

/** Le variazioni da raccontare: le due salite e la discesa più grandi, oltre 5 € (Altro escluso). */
export function biggestChanges(changes: CategoryChange[]): { up: CategoryChange[]; down: CategoryChange[] } {
  const real = changes.filter((c) => c.key !== "altro" && Math.abs(c.delta) >= 5);
  return {
    up: real.filter((c) => c.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 2),
    down: real.filter((c) => c.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 1),
  };
}

import "server-only";
import { redis } from "./store";
import type { Movement } from "./flows";
import { findDeductions, isDuplicate, type Deduction } from "./deductions";

/**
 * Le banche danno solo gli ultimi 90-120 giorni: le spese detraibili si salvano man mano, per anno,
 * così a fine anno c'è tutto l'anno. Una volta salvate restano anche quando escono dalla finestra.
 */
const key = (year: string) => `saldi:730:${year}`;

export async function listDeductions(year: string): Promise<Deduction[]> {
  const r = redis();
  if (!r) return [];
  const data = (await r.hgetall<Record<string, Deduction>>(key(year))) ?? {};
  return Object.values(data).sort((a, b) => b.date.localeCompare(a.date));
}

export async function deductionYears(): Promise<string[]> {
  const r = redis();
  if (!r) return [];
  const keys = await r.keys("saldi:730:*");
  return keys.map((k) => k.slice("saldi:730:".length)).filter((y) => /^\d{4}$/.test(y)).sort().reverse();
}

/** Salva le spese detraibili nuove trovate tra i movimenti; restituisce quante. */
export async function recordDeductions(moves: Movement[]): Promise<number> {
  const r = redis();
  if (!r) return 0;
  const found = findDeductions(moves);
  if (!found.length) return 0;
  let added = 0;
  for (const year of new Set(found.map((d) => d.date.slice(0, 4)))) {
    const existing = await listDeductions(year);
    const fresh: Record<string, Deduction> = {};
    for (const d of found.filter((x) => x.date.startsWith(year))) {
      if (isDuplicate(d, [...existing, ...Object.values(fresh)])) continue;
      fresh[d.id] = d;
    }
    if (Object.keys(fresh).length) {
      await r.hset(key(year), fresh);
      added += Object.keys(fresh).length;
    }
  }
  return added;
}

export async function saveDeduction(d: Deduction): Promise<void> {
  const r = redis();
  if (!r) throw new Error("Storage non configurato");
  await r.hset(key(d.date.slice(0, 4)), { [d.id]: d });
}

export async function getDeduction(year: string, id: string): Promise<Deduction | null> {
  return (await redis()?.hget<Deduction>(key(year), id)) ?? null;
}

export async function removeDeduction(year: string, id: string): Promise<void> {
  await redis()?.hdel(key(year), id);
}

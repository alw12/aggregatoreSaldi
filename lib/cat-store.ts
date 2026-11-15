import "server-only";
import { redis } from "./store";
import { isCategory, type CatOpts, type CatRules, type CategoryKey } from "./categories";
import type { Debt } from "./debts";

const KEY = "saldi:catrules";

/** Correzioni di categoria fatte dal sito: chiave della controparte → categoria. */
export async function listCatRules(): Promise<CatRules> {
  const r = redis();
  if (!r) return {};
  const data = (await r.hgetall<Record<string, string>>(KEY)) ?? {};
  return Object.fromEntries(Object.entries(data).filter(([, v]) => isCategory(v))) as CatRules;
}

/** `null` toglie la correzione: torna la categoria automatica. */
export async function setCatRule(key: string, category: CategoryKey | null): Promise<void> {
  const r = redis();
  if (!r) throw new Error("Storage non configurato");
  if (category) await r.hset(KEY, { [key]: category });
  else await r.hdel(KEY, key);
}

/** Opzioni di categorizzazione: rate dei debiti e correzioni a mano. */
export async function loadCatOpts(debts: Debt[]): Promise<CatOpts> {
  return { installments: debts.flatMap((d) => (d.installment ? [d.installment] : [])), rules: await listCatRules().catch(() => ({})) };
}

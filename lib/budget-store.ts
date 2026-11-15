import "server-only";
import { redis } from "./store";
import { EMPTY_BUDGET, type BudgetSettings } from "./budget";

const KEY = "saldi:budget";

export async function getBudget(): Promise<BudgetSettings> {
  const r = redis();
  if (!r) return EMPTY_BUDGET;
  const b = await r.get<BudgetSettings>(KEY);
  return b ? { goal: b.goal ?? null, limits: b.limits ?? {} } : EMPTY_BUDGET;
}

export async function saveBudget(b: BudgetSettings): Promise<void> {
  const r = redis();
  if (!r) throw new Error("Storage non configurato");
  await r.set(KEY, b);
}

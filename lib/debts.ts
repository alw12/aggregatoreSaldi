import "server-only";
import { redis } from "./store";

/**
 * Debito registrato a mano. Solo promemoria privato: non entra nel totale e non
 * compare in dashboard; si vede solo su /debiti.
 */
export type Debt = {
  id: string;
  name: string; // a chi / per cosa
  amount: number; // EUR ancora da restituire
  dueDate: string | null; // YYYY-MM-DD
  note: string | null;
  updatedAt: string;
};

const KEY = "saldi:debts";

export async function listDebts(): Promise<Debt[]> {
  const r = redis();
  if (!r) return [];
  const data = await r.hgetall<Record<string, Debt>>(KEY);
  return Object.values(data ?? {}).sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
}

export async function getDebt(id: string): Promise<Debt | null> {
  const r = redis();
  if (!r) return null;
  return (await r.hget<Debt>(KEY, id)) ?? null;
}

export async function saveDebt(d: Debt): Promise<void> {
  const r = redis();
  if (!r) throw new Error("Storage non configurato");
  await r.hset(KEY, { [d.id]: d });
}

export async function removeDebt(id: string): Promise<void> {
  const r = redis();
  if (!r) return;
  await r.hdel(KEY, id);
}

import "server-only";
import { redis } from "./store";

/**
 * Saldi inseriti a mano:
 * - override sui conti PSD2 (sostituisce il saldo letto dalla banca finché non lo si rimuove);
 * - conti manuali, per ciò che non passa da Enable Banking (contanti, banche non supportate).
 */
export type BalanceOverride = { amount: number; updatedAt: string };

export type ManualAccount = {
  id: string;
  name: string;
  currency: string;
  amount: number;
  updatedAt: string;
};

const OVERRIDES_KEY = "saldi:overrides";
const ACCOUNTS_KEY = "saldi:manual-accounts";

export async function listOverrides(): Promise<Record<string, BalanceOverride>> {
  const r = redis();
  if (!r) return {};
  return (await r.hgetall<Record<string, BalanceOverride>>(OVERRIDES_KEY)) ?? {};
}

export async function setOverride(uid: string, amount: number): Promise<void> {
  const r = redis();
  if (!r) throw new Error("Storage non configurato");
  await r.hset(OVERRIDES_KEY, { [uid]: { amount, updatedAt: new Date().toISOString() } satisfies BalanceOverride });
}

export async function clearOverride(uid: string): Promise<void> {
  const r = redis();
  if (!r) return;
  await r.hdel(OVERRIDES_KEY, uid);
}

export async function listManualAccounts(): Promise<ManualAccount[]> {
  const r = redis();
  if (!r) return [];
  const data = await r.hgetall<Record<string, ManualAccount>>(ACCOUNTS_KEY);
  return Object.values(data ?? {}).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getManualAccount(id: string): Promise<ManualAccount | null> {
  const r = redis();
  if (!r) return null;
  return (await r.hget<ManualAccount>(ACCOUNTS_KEY, id)) ?? null;
}

export async function saveManualAccount(a: ManualAccount): Promise<void> {
  const r = redis();
  if (!r) throw new Error("Storage non configurato");
  await r.hset(ACCOUNTS_KEY, { [a.id]: a });
}

export async function removeManualAccount(id: string): Promise<void> {
  const r = redis();
  if (!r) return;
  await r.hdel(ACCOUNTS_KEY, id);
}

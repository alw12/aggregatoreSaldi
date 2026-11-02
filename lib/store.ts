import "server-only";
import { Redis } from "@upstash/redis";

export type StoredAccount = {
  uid: string;
  iban?: string;
  label: string;
  currency: string;
  type: string;
};

export type StoredSession = {
  sessionId: string;
  aspsp: { name: string; country: string };
  validUntil: string;
  createdAt: string;
  accounts: StoredAccount[];
};

const KEY = "saldi:sessions";
export const STATE_COOKIE = "saldi_eb_state";

export function redis(): Redis | null {
  // Priorità: variabili create dall'integrazione Vercel con prefisso SALDI, poi quelle standard
  const url =
    process.env.SALDI_KV_REST_API_URL ?? process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.SALDI_KV_REST_API_TOKEN ?? process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

export function hasStore(): boolean {
  return redis() !== null;
}

export async function listSessions(): Promise<StoredSession[]> {
  const r = redis();
  if (!r) return [];
  const data = await r.hgetall<Record<string, StoredSession>>(KEY);
  return Object.values(data ?? {}).sort((a, b) => a.aspsp.name.localeCompare(b.aspsp.name));
}

export async function saveSession(s: StoredSession): Promise<void> {
  const r = redis();
  if (!r) throw new Error("Storage non configurato (manca Upstash Redis)");
  await r.hset(KEY, { [s.sessionId]: s });
}

export async function removeSession(sessionId: string): Promise<void> {
  const r = redis();
  if (!r) return;
  await r.hdel(KEY, sessionId);
  await r.del(`saldi:bal:${sessionId}`);
}

/**
 * Ultima lettura riuscita dei saldi di ogni banca. Non scade: la dashboard la mostra subito e, se è
 * vecchia, la rilegge dalla banca in background (le banche PSD2 limitano comunque le letture).
 */
export type CachedBalances = { fetchedAt: string; data: Record<string, unknown> };

export async function getCachedBalances(sessionId: string): Promise<CachedBalances | null> {
  const r = redis();
  if (!r) return null;
  return r.get<CachedBalances>(`saldi:bal:${sessionId}`);
}

export async function setCachedBalances(sessionId: string, value: CachedBalances) {
  const r = redis();
  if (!r) return;
  await r.set(`saldi:bal:${sessionId}`, value);
}

const REFRESH_KEY = "saldi:bal:refreshAt";

/** "Aggiorna": le letture salvate prima di adesso vanno rifatte, ma restano come riserva se la banca non risponde. */
export async function requestBalanceRefresh(): Promise<void> {
  await redis()?.set(REFRESH_KEY, new Date().toISOString());
}

export async function balanceRefreshRequestedAt(): Promise<string | null> {
  return (await redis()?.get<string>(REFRESH_KEY)) ?? null;
}

/** Una sola rilettura in background per banca alla volta, anche con più pagine aperte insieme. */
export async function lockBalanceRefresh(sessionId: string): Promise<boolean> {
  const r = redis();
  if (!r) return false;
  return (await r.set(`saldi:bal:lock:${sessionId}`, 1, { nx: true, ex: 60 })) === "OK";
}

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

function redis(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
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

/** Cache dei saldi: le banche PSD2 limitano le letture, quindi non interroghiamo a ogni refresh. */
export type CachedBalances = { fetchedAt: string; data: Record<string, unknown> };

export async function getCachedBalances(sessionId: string): Promise<CachedBalances | null> {
  const r = redis();
  if (!r) return null;
  return r.get<CachedBalances>(`saldi:bal:${sessionId}`);
}

export async function setCachedBalances(sessionId: string, value: CachedBalances, ttlSeconds: number) {
  const r = redis();
  if (!r) return;
  await r.set(`saldi:bal:${sessionId}`, value, { ex: ttlSeconds });
}

export async function clearBalanceCache(): Promise<void> {
  const r = redis();
  if (!r) return;
  const ids = Object.keys((await r.hgetall(KEY)) ?? {});
  if (ids.length) await r.del(...ids.map((id) => `saldi:bal:${id}`));
}

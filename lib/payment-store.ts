import "server-only";
import { redis } from "./store";
import type { TransferDraft } from "./payments";

/**
 * Bonifici avviati dall'app. "draft" = controllato ma non ancora mandato alla banca; poi lo stato è
 * quello ISO 20022 restituito da Enable Banking, oppure "error" se l'autorizzazione non è andata.
 */
export type StoredPayment = TransferDraft & {
  id: string;
  sessionId: string;
  bank: string;
  country: string;
  fromIban: string;
  fromLabel: string;
  currency: string;
  status: string;
  final: boolean;
  createdAt: string;
  updatedAt: string;
  paymentId?: string;
  state?: string;
  reason?: string; // motivo del rifiuto o dell'errore, dalla banca
};

const KEY = "saldi:payments";
const STATE_KEY = (state: string) => `saldi:pay:state:${state}`;
const KEEP = 60;
const DRAFT_HOURS = 24;

export const PAY_STATE_COOKIE = "saldi_pay_state";

function store() {
  const r = redis();
  if (!r) throw new Error("Storage non configurato (manca Upstash Redis)");
  return r;
}

/** Dal più recente; le bozze vecchie e i bonifici oltre gli ultimi 60 vengono tolti. */
export async function listPayments(): Promise<StoredPayment[]> {
  const r = redis();
  if (!r) return [];
  const all = Object.values((await r.hgetall<Record<string, StoredPayment>>(KEY)) ?? {}).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const cutoff = new Date(Date.now() - DRAFT_HOURS * 3600_000).toISOString();
  const stale = all.filter((p, i) => (p.status === "draft" && p.createdAt < cutoff) || i >= KEEP);
  if (stale.length) await r.hdel(KEY, ...stale.map((p) => p.id));
  return all.filter((p) => !stale.includes(p));
}

export async function getPayment(id: string): Promise<StoredPayment | null> {
  const r = redis();
  if (!r || !id) return null;
  return (await r.hget<StoredPayment>(KEY, id)) ?? null;
}

export async function savePayment(p: StoredPayment): Promise<void> {
  await store().hset(KEY, { [p.id]: { ...p, updatedAt: new Date().toISOString() } });
}

export async function removePayment(id: string): Promise<void> {
  await redis()?.hdel(KEY, id);
}

/** Lo state dell'autorizzazione in banca porta al bonifico (vale un'ora). */
export async function bindState(state: string, id: string): Promise<void> {
  await store().set(STATE_KEY(state), id, { ex: 3600 });
}

export async function paymentForState(state: string): Promise<StoredPayment | null> {
  const r = redis();
  if (!r) return null;
  const id = await r.get<string>(STATE_KEY(state));
  if (!id) return null;
  await r.del(STATE_KEY(state));
  return getPayment(id);
}

/** Beneficiari già pagati (escluso chi ha rifiutato o annullato), il più recente per IBAN. */
export function recentBeneficiaries(payments: StoredPayment[], max = 8): { name: string; iban: string }[] {
  const seen = new Map<string, { name: string; iban: string }>();
  for (const p of payments) {
    if (p.status === "draft" || p.status === "error" || ["RJCT", "CNCL", "ACCR"].includes(p.status)) continue;
    if (!seen.has(p.iban)) seen.set(p.iban, { name: p.name, iban: p.iban });
  }
  return [...seen.values()].slice(0, max);
}

/** Un solo invio alla banca per bozza, anche con doppio tocco su "Conferma". */
export async function lockSend(id: string): Promise<boolean> {
  return (await store().set(`saldi:pay:lock:${id}`, 1, { nx: true, ex: 120 })) === "OK";
}

export async function unlockSend(id: string): Promise<void> {
  await redis()?.del(`saldi:pay:lock:${id}`);
}

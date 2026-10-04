import "server-only";
import { redis } from "./store";

/**
 * Carta di credito inserita a mano: via PSD2 molte banche non espongono le
 * carte a saldo. Si salvano solo nome e ultime 4 cifre: mai numero completo,
 * CVV o scadenza.
 */
export type CreditCard = {
  id: string;
  name: string; // es. "Amex Oro" o "Visa BBVA"
  last4: string | null;
  balance: number; // speso da addebitare, EUR (positivo = debito)
  limit: number | null; // plafond mensile, EUR
  chargeDay: number | null; // giorno del mese in cui viene addebitato l'estratto conto
  updatedAt: string;
};

export type CreditCardView = CreditCard & {
  available: number | null; // plafond residuo
  nextCharge: string | null; // YYYY-MM-DD
};

const KEY = "saldi:cards";

export async function listCards(): Promise<CreditCard[]> {
  const r = redis();
  if (!r) return [];
  const data = await r.hgetall<Record<string, CreditCard>>(KEY);
  return Object.values(data ?? {}).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getCard(id: string): Promise<CreditCard | null> {
  const r = redis();
  if (!r) return null;
  return (await r.hget<CreditCard>(KEY, id)) ?? null;
}

export async function saveCard(c: CreditCard): Promise<void> {
  const r = redis();
  if (!r) throw new Error("Storage non configurato");
  await r.hset(KEY, { [c.id]: c });
}

export async function removeCard(id: string): Promise<void> {
  const r = redis();
  if (!r) return;
  await r.hdel(KEY, id);
}

/** Prossima data di addebito: oggi o dopo, con il giorno limitato alla fine del mese (es. 31 → 30 aprile). */
function nextChargeDate(day: number, now: Date): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const clamp = (year: number, month: number) =>
    new Date(Date.UTC(year, month, Math.min(day, new Date(Date.UTC(year, month + 1, 0)).getUTCDate())));
  let d = clamp(y, m);
  if (d.getTime() < Date.UTC(y, m, now.getUTCDate())) d = clamp(y, m + 1);
  return d.toISOString().slice(0, 10);
}

export async function loadCards(): Promise<CreditCardView[]> {
  const now = new Date();
  return (await listCards()).map((c) => ({
    ...c,
    available: c.limit !== null ? c.limit - c.balance : null,
    nextCharge: c.chargeDay !== null ? nextChargeDate(c.chargeDay, now) : null,
  }));
}

import "server-only";
import { redis } from "./store";

/**
 * Buono Fruttifero Postale inserito a mano: via PSD2 Poste espone solo i conti,
 * non i buoni (cartacei o dematerializzati).
 */
export type Bond = {
  id: string;
  name: string; // es. "BFP 3x4" o la serie
  capital: number; // valore nominale sottoscritto, EUR
  subscribedAt: string; // YYYY-MM-DD
  maturityYears: number | null; // durata massima; oltre non matura più interessi
  grossRate: number | null; // tasso annuo lordo effettivo a scadenza, in %
  manualValue: number | null; // valore di rimborso netto letto dall'app BancoPosta
  updatedAt: string;
};

export type BondView = Bond & {
  value: number; // EUR, netto
  valueSource: "manuale" | "stima" | "nominale";
  yearsHeld: number; // anni interi trascorsi dalla sottoscrizione
  matured: boolean;
};

const KEY = "saldi:bonds";
/** Ritenuta sugli interessi dei BFP (aliquota agevolata titoli di Stato). */
const TAX = 0.125;

export async function listBonds(): Promise<Bond[]> {
  const r = redis();
  if (!r) return [];
  const data = await r.hgetall<Record<string, Bond>>(KEY);
  return Object.values(data ?? {}).sort((a, b) => a.subscribedAt.localeCompare(b.subscribedAt));
}

export async function getBond(id: string): Promise<Bond | null> {
  const r = redis();
  if (!r) return null;
  return (await r.hget<Bond>(KEY, id)) ?? null;
}

export async function saveBond(b: Bond): Promise<void> {
  const r = redis();
  if (!r) throw new Error("Storage non configurato");
  await r.hset(KEY, { [b.id]: b });
}

export async function removeBond(id: string): Promise<void> {
  const r = redis();
  if (!r) return;
  await r.hdel(KEY, id);
}

function fullYearsSince(isoDate: string, now = new Date()): number {
  const d = new Date(`${isoDate}T00:00:00Z`);
  let years = now.getUTCFullYear() - d.getUTCFullYear();
  const anniversary = Date.UTC(now.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  if (now.getTime() < anniversary) years -= 1;
  return Math.max(0, years);
}

/**
 * Valore netto: quello inserito a mano se presente, altrimenti una stima a
 * interessi composti annui sugli anni interi trascorsi (al netto del 12,5%).
 * La stima è approssimata: alcuni buoni (es. 3x4) riconoscono gli interessi
 * solo a scaglioni, quindi il valore esatto è quello dell'app BancoPosta.
 */
export function valueBond(b: Bond, now = new Date()): BondView {
  const elapsed = fullYearsSince(b.subscribedAt, now);
  const matured = b.maturityYears !== null && elapsed >= b.maturityYears;
  const yearsHeld = b.maturityYears !== null ? Math.min(elapsed, b.maturityYears) : elapsed;

  if (b.manualValue !== null) return { ...b, value: b.manualValue, valueSource: "manuale", yearsHeld, matured };
  if (b.grossRate === null) return { ...b, value: b.capital, valueSource: "nominale", yearsHeld, matured };

  const gross = b.capital * Math.pow(1 + b.grossRate / 100, yearsHeld);
  const value = b.capital + (gross - b.capital) * (1 - TAX);
  return { ...b, value, valueSource: "stima", yearsHeld, matured };
}

export async function loadBonds(): Promise<BondView[]> {
  const now = new Date();
  return (await listBonds()).map((b) => valueBond(b, now));
}

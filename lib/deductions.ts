/** Spese detraibili al 19% per il 730: riconoscimento e calcolo, logica pura (testata in deductions.test.ts). */

import type { Movement } from "./flows";
import { partyKey } from "./party";

export type DeductionType = "sanitaria" | "veterinaria";

export type Deduction = {
  id: string; // id del movimento, o "m:<uuid>" per quelle aggiunte a mano
  date: string;
  amount: number; // positivo
  party: string;
  type: DeductionType;
  source: "auto" | "manuale";
  excluded: boolean; // tolta a mano (es. in farmacia hai comprato anche altro)
};

const VET = /veterinar|clinica vet|ambulatorio vet/i;
const HEALTH =
  /farmaci|parafarm|\bmedic[oiae]?\b|centro medico|studio medico|ospedal|clinic|dentist|odontoiatr|ortodon|ottic|oculist|analisi|\basl\b|\bausl\b|\busl\b|ticket sanit|poliambulat|fisioterap|psicolog|psicoterap|ortoped|cardiolog|dermatolog|ginecolog|radiolog|diagnostic|sanitari|logoped|podolog/i;

/** Tipo di spesa detraibile riconosciuto dal nome di chi incassa; null se non lo è. */
export function deductionType(party: string): DeductionType | null {
  if (VET.test(party)) return "veterinaria";
  if (HEALTH.test(party)) return "sanitaria";
  return null;
}

/** Le uscite in EUR che sembrano spese detraibili. */
export function findDeductions(moves: Movement[]): Deduction[] {
  return moves.flatMap((m) => {
    if (m.kind !== "out" || m.currency !== "EUR" || m.amount >= 0) return [];
    const type = deductionType(m.party);
    return type ? [{ id: m.id, date: m.date, amount: -m.amount, party: m.party, type, source: "auto" as const, excluded: false }] : [];
  });
}

const daysApart = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

/** Stesso addebito visto prima "in attesa" e poi contabilizzato (id diversi): conta una volta. */
export function isDuplicate(d: Deduction, existing: Deduction[]): boolean {
  return existing.some(
    (e) => e.id === d.id || (Math.abs(e.amount - d.amount) < 0.005 && daysApart(e.date, d.date) <= 3 && partyKey(e.party) === partyKey(d.party)),
  );
}

// Art. 15 TUIR: 19% oltre la franchigia di 129,11 €; le veterinarie fino a 550 €
export const FRANCHIGIA = 129.11;
export const VET_LIMIT = 550;
export const RATE = 0.19;

export type DeductionSummary = { health: number; vet: number; healthBack: number; vetBack: number; back: number };

export function summarizeDeductions(items: Deduction[]): DeductionSummary {
  const sum = (t: DeductionType) => items.filter((d) => d.type === t && !d.excluded).reduce((s, d) => s + d.amount, 0);
  const health = sum("sanitaria");
  const vet = sum("veterinaria");
  const healthBack = Math.max(0, health - FRANCHIGIA) * RATE;
  const vetBack = Math.max(0, Math.min(vet, VET_LIMIT) - FRANCHIGIA) * RATE;
  return { health, vet, healthBack, vetBack, back: healthBack + vetBack };
}

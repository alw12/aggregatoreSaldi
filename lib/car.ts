/** Quanto costa l'auto al mese: rata, carburante, pedaggi, parcheggi, manutenzione, assicurazione, bollo. Logica pura (car.test.ts). */

import type { Movement } from "./flows";
import type { CatRules } from "./categories";
import { isInstallment } from "./loan-payments";
import { partyKey } from "./party";
import { completeMonths } from "./budget";

export type CarPart = "rata" | "carburante" | "pedaggi" | "parcheggi" | "manutenzione" | "assicurazione" | "bollo";

/** Colore fisso per voce (--c1…--c8): la rata ha il rosso di "Rate e prestiti", il carburante l'acqua di "Trasporti". */
export const CAR_PARTS: Record<CarPart, { label: string; color: number }> = {
  rata: { label: "Rata", color: 8 },
  carburante: { label: "Carburante", color: 3 },
  pedaggi: { label: "Pedaggi e Telepass", color: 1 },
  parcheggi: { label: "Parcheggi", color: 7 },
  manutenzione: { label: "Manutenzione e gomme", color: 4 },
  assicurazione: { label: "Assicurazione", color: 5 },
  bollo: { label: "Bollo", color: 2 },
};

// L'ordine conta: "Unipol" è il Telepass (UnipolMove), l'assicurazione si riconosce dalla parola
const RULES: [CarPart, RegExp][] = [
  ["assicurazione", /assicurazion|\brca\b|genialloyd|\bverti\b|conte\.it|allianz direct|zurich connect|quixa|prima assicura|linear assic|unipolsai/i],
  ["bollo", /bollo auto|tassa automobilist|\baci\b/i],
  ["pedaggi", /autostrad|telepass|unipolmove|unipoltech|unipol move|pedagg|free to x/i],
  ["parcheggi", /parchegg|easypark|mycicero|\bsosta\b|saba italia|apcoa|indigo/i],
  ["manutenzione", /officina|meccanic|gommist|pneumatic|revisione|autolavagg|lavaggio auto|car wash|carrozzer|ricambi auto|norauto|euromaster|tagliando|autoricambi/i],
  ["carburante", /metano|petroli|impianto ss|new gas|gas network|\beni\b|eni pv|enilive|\bq8|tamoil|\besso\b|\bshell\b|repsol|carburant|benzin|distributor|\bip\b|api-ip|gpl\b|stazione di servizio/i],
];

/** Cosa scrivi a mano: il debito dell'auto e le spese annuali che la banca (ultimi 90 giorni) non mostra. */
export type CarSettings = {
  loanId: string | null; // debito della rata; null = nessuna rata
  annual: Partial<Record<"assicurazione" | "bollo" | "manutenzione", number>>; // € l'anno
  kmYear: number | null;
};
export const EMPTY_CAR: CarSettings = { loanId: null, annual: {}, kmYear: null };

/** Voce di costo dell'auto di un movimento, o null. Una correzione di categoria diversa da Trasporti la esclude. */
export function carPart(m: Movement, installment: number | null, rules: CatRules = {}): CarPart | null {
  if (m.kind !== "out" || m.currency !== "EUR" || m.amount >= 0) return null;
  if (installment && isInstallment(m, installment)) return "rata";
  const rule = rules[partyKey(m.party)];
  if (rule && rule !== "trasporti") return null;
  for (const [part, re] of RULES) if (re.test(m.party)) return part;
  return null;
}

export type CarLine = {
  part: CarPart;
  label: string;
  color: number;
  monthly: number;
  source: "movimenti" | "debito" | "annuale";
  moves: Movement[]; // degli ultimi mesi interi e del mese in corso
};

export type CarCost = {
  lines: CarLine[];
  monthly: number;
  yearly: number;
  perKm: number | null;
  basis: number; // mesi interi usati per le medie dai movimenti
  thisMonth: number; // speso questo mese finora, dai movimenti (rata compresa se passata)
  withoutLoan: number; // al mese, quando la rata è finita
};

/**
 * Media al mese di ogni voce. Rata: quella del debito. Spese annuali scritte a mano: ÷ 12, e i movimenti
 * di quella voce non contano (sarebbero contati due volte). Il resto: media dei mesi interi letti.
 */
export function carCost(moves: Movement[], today: string, settings: CarSettings, loan: { installment: number; amount: number } | null, rules: CatRules = {}): CarCost {
  const month = today.slice(0, 7);
  const full = new Set(completeMonths(moves, month).slice(-3));
  const installment = loan && loan.amount > 0 ? loan.installment : null;
  const byPart = new Map<CarPart, Movement[]>();
  let thisMonth = 0;
  for (const m of moves) {
    const ym = m.date.slice(0, 7);
    if (!full.has(ym) && ym !== month) continue;
    const part = carPart(m, installment, rules);
    if (!part) continue;
    byPart.set(part, [...(byPart.get(part) ?? []), m]);
    if (ym === month && m.date <= today) thisMonth -= m.amount;
  }
  const lines: CarLine[] = [];
  for (const part of Object.keys(CAR_PARTS) as CarPart[]) {
    const ms = (byPart.get(part) ?? []).sort((a, b) => b.date.localeCompare(a.date));
    const annual = part === "assicurazione" || part === "bollo" || part === "manutenzione" ? settings.annual[part] : undefined;
    let monthly = 0;
    let source: CarLine["source"] = "movimenti";
    if (part === "rata") {
      if (!installment) continue;
      monthly = installment;
      source = "debito";
    } else if (annual) {
      monthly = annual / 12;
      source = "annuale";
    } else {
      if (!full.size) continue;
      monthly = ms.filter((m) => full.has(m.date.slice(0, 7))).reduce((s, m) => s - m.amount, 0) / full.size;
    }
    if (monthly <= 0 && !ms.length) continue;
    lines.push({ part, ...CAR_PARTS[part], monthly, source, moves: ms });
  }
  lines.sort((a, b) => b.monthly - a.monthly);
  const monthlyTotal = lines.reduce((s, l) => s + l.monthly, 0);
  return {
    lines,
    monthly: monthlyTotal,
    yearly: monthlyTotal * 12,
    perKm: settings.kmYear ? (monthlyTotal * 12) / settings.kmYear : null,
    basis: full.size,
    thisMonth,
    withoutLoan: monthlyTotal - (installment ?? 0),
  };
}

/** Il debito che sembra la rata dell'auto, se non è stato scelto: dal nome. */
export function guessCarLoan<T extends { id: string; name: string; installment?: number | null; amount: number }>(debts: T[]): T | null {
  return debts.find((d) => d.installment && d.amount > 0 && /auto|macchin|vettur|\bcar\b|compass|finanziamento/i.test(d.name)) ?? null;
}

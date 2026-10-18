/** Classificazione e somme mensili dei movimenti: logica pura (testata in flows.test.ts). */

export type Kind = "in" | "out" | "invest" | "internal";

export type Movement = {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number; // con segno: + entrata, − uscita
  currency: string;
  party: string; // controparte o descrizione
  account: string; // "Banca, conto"
  counterIban?: string | null;
  kind: Kind;
};

// Soldi spostati verso broker, salvadanai e risparmio: non sono spese, sono messi da parte
const INVEST =
  /scalable|trade ?republic|directa|degiro|fineco.*titoli|moneyfarm|revolut.*(invest|stock)|buon[oi] frutt|\bbfp\b|fondo pensione|cometa|fonte\b|investiment|risparmio|salvadanaio|\bvault\b|\bpocket\b|round.?up/i;

const TRANSFER = /giroconto|ricarica|top.?up|trasferimento tra/i;

/**
 * `own` riconosce i propri conti dal testo: nomi delle altre banche collegate (la ricarica Revolut da
 * BancoPosta appare come "PAGAMENTO POS Revolut**1640") e il nome dell'intestatario.
 */
export function classify(amount: number, party: string, counterIban: string | null, ownIbans: Set<string>, own?: RegExp | null): Kind {
  if (counterIban && ownIbans.has(counterIban.replace(/\s/g, "").toUpperCase())) return "internal";
  if (TRANSFER.test(party) || own?.test(party)) return "internal";
  if (amount < 0 && INVEST.test(party)) return "invest";
  return amount >= 0 ? "in" : "out";
}

export type MonthFlow = { month: string; income: number; spending: number; invested: number; saved: number; rate: number | null };

/** Somme per mese (solo EUR, senza giroconti), dal più vecchio. */
export function monthlyFlows(moves: Movement[]): MonthFlow[] {
  const map = new Map<string, MonthFlow>();
  for (const m of moves) {
    if (m.currency !== "EUR" || m.kind === "internal") continue;
    const key = m.date.slice(0, 7);
    const f = map.get(key) ?? { month: key, income: 0, spending: 0, invested: 0, saved: 0, rate: null };
    if (m.kind === "in") f.income += m.amount;
    else if (m.kind === "invest") f.invested -= m.amount;
    else f.spending -= m.amount;
    map.set(key, f);
  }
  return [...map.values()]
    .map((f) => ({ ...f, saved: f.income - f.spending, rate: f.income > 0 ? (f.income - f.spending) / f.income : null }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/** Media sui mesi completi (escluso quello in corso e il primo, spesso parziale). */
export function averageMonth(flows: MonthFlow[], currentMonth: string): { income: number; spending: number; saved: number; months: number } | null {
  const full = flows.filter((f) => f.month < currentMonth).slice(1).slice(-3);
  const use = full.length ? full : flows.filter((f) => f.month < currentMonth).slice(-3);
  if (!use.length) return null;
  const avg = (k: "income" | "spending" | "saved") => use.reduce((s, f) => s + f[k], 0) / use.length;
  return { income: avg("income"), spending: avg("spending"), saved: avg("saved"), months: use.length };
}

/** Dove vanno i soldi: uscite per controparte, dalla più grande. */
export function topSpending(moves: Movement[], since: string, n = 8): { party: string; total: number; count: number }[] {
  const map = new Map<string, { party: string; total: number; count: number }>();
  for (const m of moves) {
    if (m.kind !== "out" || m.date < since || m.currency !== "EUR") continue;
    const key = m.party.toLowerCase().replace(/\s+/g, " ").slice(0, 40);
    const cur = map.get(key) ?? { party: m.party.slice(0, 40), total: 0, count: 0 };
    cur.total -= m.amount;
    cur.count++;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total).slice(0, n);
}

const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const GENERIC = /conto|corrente|account|carta|card|deposito|risparmio|libretto|\d/i;

/**
 * Espressione per i movimenti verso i propri conti, vista da un conto della banca `bank`: i nomi delle
 * altre banche collegate e le etichette che sono nomi di persona (Revolut usa l'intestatario come nome del conto).
 */
export function ownPattern(bank: string, banks: string[], labels: string[]): RegExp | null {
  const firstWord = (b: string) => b.split(/[\s.]+/)[0];
  const others = banks.filter((b) => b !== bank).map(firstWord).filter((w) => w.length >= 4);
  // BancoPosta compare anche come "Poste"
  if (banks.some((b) => b !== bank && /bancoposta|poste/i.test(b))) others.push("Poste", "BancoPosta");
  const names = labels.filter((l) => /^\p{L}+(?: \p{L}+)+$/u.test(l.trim()) && !GENERIC.test(l)).map((l) => l.trim());
  const terms = [...new Set([...others, ...names])].map(escape);
  return terms.length ? new RegExp(`\\b(?:${terms.join("|")})`, "i") : null;
}

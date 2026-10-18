/** Classificazione e somme mensili dei movimenti: logica pura (testata in flows.test.ts). */

export type Kind = "in" | "out" | "invest" | "internal";

export type Movement = {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number; // con segno: + entrata, − uscita
  currency: string;
  party: string; // controparte o descrizione
  account: string; // "Banca, conto"
  kind: Kind;
};

// Soldi spostati verso broker e risparmio: non sono spese, sono risparmio investito
const INVEST = /scalable|trade ?republic|directa|degiro|fineco.*titoli|moneyfarm|revolut.*(invest|stock)|buon[oi] frutt|\bbfp\b|fondo pensione|cometa|fonte\b|investiment/i;

export function classify(amount: number, party: string, counterIban: string | null, ownIbans: Set<string>): Kind {
  if (counterIban && ownIbans.has(counterIban.replace(/\s/g, "").toUpperCase())) return "internal";
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

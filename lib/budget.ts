/** Budget, obiettivo di risparmio, previsione del mese e spese ricorrenti: logica pura (testata in budget.test.ts). */

import type { Movement } from "./flows";
import { CATEGORIES, categorize, type CategoryKey, type CatOpts } from "./categories";
import { partyKey } from "./party";

export type BudgetSettings = {
  goal: number | null; // € da mettere da parte ogni mese
  limits: Partial<Record<CategoryKey, number>>; // tetto mensile per categoria
};

export const EMPTY_BUDGET: BudgetSettings = { goal: null, limits: {} };

const dayOf = (iso: string) => Number(iso.slice(8, 10));
export const daysInMonth = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
export function addMonths(ym: string, n: number): string {
  const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
/** Lo stesso giorno il mese dopo (il 31 diventa l'ultimo giorno del mese, se più corto). */
function nextMonthSameDay(iso: string): string {
  const ym = addMonths(iso.slice(0, 7), 1);
  return `${ym}-${String(Math.min(dayOf(iso), daysInMonth(ym))).padStart(2, "0")}`;
}

const counts = (m: Movement) => m.currency === "EUR" && m.kind !== "internal";

/**
 * Mesi interi letti, prima di quello in corso. Il primo mese è intero solo se i movimenti partono
 * dal giorno 1: le banche danno gli ultimi 90-120 giorni, quindi di solito inizia a metà.
 */
export function completeMonths(moves: Movement[], currentMonth: string): string[] {
  const dates = moves.filter(counts).map((m) => m.date);
  if (!dates.length) return [];
  const first = dates.reduce((a, b) => (a < b ? a : b));
  let m = dayOf(first) === 1 ? first.slice(0, 7) : addMonths(first.slice(0, 7), 1);
  const out: string[] = [];
  while (m < currentMonth) {
    out.push(m);
    m = addMonths(m, 1);
  }
  return out;
}

export type Forecast = {
  month: string;
  daysLeft: number; // oggi compreso
  basis: number; // mesi interi usati per la stima (0 = non abbastanza dati)
  income: { sofar: number; expected: number };
  spending: { sofar: number; expected: number };
  invested: number; // messo da parte finora (broker, buoni…): non è una spesa
  saved: number; // entrate previste − uscite previste
};

/**
 * Come finisce il mese. Uscite: quelle fatte finora più quelle che negli ultimi mesi interi sono
 * arrivate dopo questo giorno del mese (affitto il 1°, carta il 15… contano al loro posto).
 * Entrate: almeno la media dei mesi interi, così lo stipendio non ancora arrivato conta.
 */
export function forecastMonth(moves: Movement[], today: string): Forecast {
  const month = today.slice(0, 7);
  const d = dayOf(today);
  const full = completeMonths(moves, month).slice(-3);
  const sums = (ym: string, upTo: number) => {
    let income = 0, spending = 0, invested = 0;
    for (const m of moves) {
      if (!counts(m) || m.date.slice(0, 7) !== ym || dayOf(m.date) > upTo) continue;
      if (m.kind === "in") income += m.amount;
      else if (m.kind === "invest") invested -= m.amount;
      else spending -= m.amount;
    }
    return { income, spending, invested };
  };
  const now = sums(month, d);
  const avg = (f: (ym: string) => number) => (full.length ? full.reduce((s, ym) => s + f(ym), 0) / full.length : 0);
  const avgIncome = avg((ym) => sums(ym, 31).income);
  const restSpending = avg((ym) => sums(ym, 31).spending - sums(ym, Math.min(d, daysInMonth(ym))).spending);
  const income = { sofar: now.income, expected: Math.max(now.income, avgIncome) };
  const spending = { sofar: now.spending, expected: now.spending + Math.max(0, restSpending) };
  return {
    month,
    daysLeft: daysInMonth(month) - d + 1,
    basis: full.length,
    income,
    spending,
    invested: now.invested,
    saved: income.expected - spending.expected,
  };
}

export type Recurring = {
  key: string;
  party: string;
  amount: number; // ultimo importo, positivo
  category: CategoryKey;
  months: number; // quante volte è passata
  first: string;
  last: string;
  next: string; // prossimo addebito previsto
};

/**
 * Spese che tornano ogni mese: stessa controparte, importo simile (±10%, almeno 1 €), una volta al
 * mese a 20-40 giorni di distanza, almeno due mesi. Lo stesso addebito visto prima "in attesa" e poi
 * contabilizzato conta una volta; quelle ferme da più di 40 giorni non ci sono più.
 */
export function recurringSpending(moves: Movement[], today: string, cat: CatOpts = {}): Recurring[] {
  const groups = new Map<string, Movement[]>();
  for (const m of moves) {
    if (m.kind !== "out" || m.currency !== "EUR" || m.amount >= 0 || m.date > today) continue;
    const key = partyKey(m.party);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  const out: Recurring[] = [];
  for (const [key, list] of groups) {
    // Gruppi per importo simile: lo stesso bar con scontrini diversi non è un abbonamento
    const clusters: Movement[][] = [];
    for (const m of [...list].sort((a, b) => a.date.localeCompare(b.date))) {
      const c = clusters.find((c) => {
        const ref = -c[0].amount;
        return Math.abs(-m.amount - ref) <= Math.max(1, ref * 0.1);
      });
      if (c) c.push(m);
      else clusters.push([m]);
    }
    for (const c of clusters) {
      const seen: Movement[] = [];
      for (const m of c) {
        const prev = seen.at(-1);
        if (prev && daysBetween(prev.date, m.date) <= 3 && Math.abs(prev.amount - m.amount) < 0.005) continue;
        seen.push(m);
      }
      if (seen.length < 2) continue;
      const months = new Set(seen.map((m) => m.date.slice(0, 7)));
      if (months.size !== seen.length) continue;
      const gaps = seen.slice(1).map((m, i) => daysBetween(seen[i].date, m.date));
      if (gaps.some((g) => g < 20 || g > 40)) continue;
      const last = seen.at(-1)!;
      if (daysBetween(last.date, today) > 40) continue;
      out.push({
        key: `${key}:${Math.round(-last.amount)}`,
        party: last.party,
        amount: -last.amount,
        category: categorize(last, cat),
        months: seen.length,
        first: seen[0].date,
        last: last.date,
        next: nextMonthSameDay(last.date),
      });
    }
  }
  return out.sort((a, b) => b.amount - a.amount);
}

/** Ricorrenti attese da domani a fine mese e non ancora passate questo mese. */
export function recurringDue(rec: Recurring[], today: string): Recurring[] {
  const month = today.slice(0, 7);
  return rec.filter((r) => r.last.slice(0, 7) !== month && r.next > today && r.next.slice(0, 7) === month);
}

export type BudgetLine = {
  key: CategoryKey;
  label: string;
  color: number;
  limit: number;
  spent: number;
  usual: number | null; // media dei mesi interi
};

/** Spesa per categoria del mese in corso fino a oggi. */
export function spentThisMonth(moves: Movement[], today: string, cat: CatOpts = {}): Map<CategoryKey, number> {
  const month = today.slice(0, 7);
  const map = new Map<CategoryKey, number>();
  for (const m of moves) {
    if (m.kind !== "out" || m.currency !== "EUR" || m.date.slice(0, 7) !== month || m.date > today) continue;
    const k = categorize(m, cat);
    map.set(k, (map.get(k) ?? 0) - m.amount);
  }
  return map;
}

/** Spesa media al mese per categoria, sugli ultimi tre mesi interi. */
export function usualByCategory(moves: Movement[], today: string, cat: CatOpts = {}): Map<CategoryKey, number> {
  const full = new Set(completeMonths(moves, today.slice(0, 7)).slice(-3));
  const map = new Map<CategoryKey, number>();
  if (!full.size) return map;
  for (const m of moves) {
    if (m.kind !== "out" || m.currency !== "EUR" || !full.has(m.date.slice(0, 7))) continue;
    const k = categorize(m, cat);
    map.set(k, (map.get(k) ?? 0) - m.amount / full.size);
  }
  return map;
}

/** Categorie con un tetto: speso finora, tetto e spesa abituale. Dalla più vicina al limite. */
export function budgetLines(moves: Movement[], limits: BudgetSettings["limits"], today: string, cat: CatOpts = {}): BudgetLine[] {
  const spent = spentThisMonth(moves, today, cat);
  const usual = usualByCategory(moves, today, cat);
  return (Object.entries(limits) as [CategoryKey, number][])
    .filter(([, limit]) => limit > 0)
    .map(([key, limit]) => ({ key, ...CATEGORIES[key], limit, spent: spent.get(key) ?? 0, usual: usual.has(key) ? usual.get(key)! : null }))
    .sort((a, b) => b.spent / b.limit - a.spent / a.limit);
}

export const BUDGET_WARN = 0.8;

export type GoalMonth = { month: string; saved: number; reached: boolean };

/** Risparmio dei mesi interi rispetto all'obiettivo (entrate − uscite, come in Movimenti). */
export function goalHistory(moves: Movement[], goal: number, today: string): GoalMonth[] {
  return completeMonths(moves, today.slice(0, 7))
    .slice(-6)
    .map((month) => {
      let saved = 0;
      for (const m of moves) if (counts(m) && m.kind !== "invest" && m.date.slice(0, 7) === month) saved += m.amount;
      return { month, saved, reached: saved >= goal };
    });
}

export type Runway = { months: number; monthly: number; available: number; basis: number };

/**
 * Mesi di autonomia: per quanti mesi la liquidità (tolto quello che le carte addebiteranno) copre le
 * spese medie degli ultimi mesi interi, senza nessuna entrata. Contano tutte le uscite, rate comprese.
 */
export function runway(cash: number, owedSoon: number, moves: Movement[], today: string): Runway | null {
  const full = new Set(completeMonths(moves, today.slice(0, 7)).slice(-3));
  if (!full.size) return null;
  let spent = 0;
  for (const m of moves) if (m.kind === "out" && m.currency === "EUR" && full.has(m.date.slice(0, 7))) spent -= m.amount;
  const monthly = spent / full.size;
  if (monthly <= 0) return null;
  const available = cash - owedSoon;
  return { months: Math.max(0, available) / monthly, monthly, available, basis: full.size };
}

export { displayParty } from "./party";

/** Report di un mese intero, confrontato con il mese prima: logica pura (testata in report.test.ts). */

import type { Movement } from "./flows";
import { CATEGORIES, categorize, type CatOpts, type CategoryKey } from "./categories";
import { addMonths, completeMonths } from "./budget";
import { displayParty } from "./party";

export type MonthTotals = { income: number; spending: number; invested: number; saved: number; rate: number | null };

export type CategoryRow = { key: CategoryKey; label: string; color: number; total: number; prev: number | null; count: number };

export type MonthReport = {
  month: string;
  totals: MonthTotals;
  prev: MonthTotals | null; // null se il mese prima non è intero
  categories: CategoryRow[]; // dalla più grande, Altro in fondo
  biggest: { party: string; date: string; amount: number; category: CategoryKey }[];
  goal: { amount: number; reached: boolean } | null;
};

const counts = (m: Movement) => m.currency === "EUR" && m.kind !== "internal";

function totalsOf(moves: Movement[], month: string): MonthTotals {
  let income = 0, spending = 0, invested = 0;
  for (const m of moves) {
    if (!counts(m) || m.date.slice(0, 7) !== month) continue;
    if (m.kind === "in") income += m.amount;
    else if (m.kind === "invest") invested -= m.amount;
    else spending -= m.amount;
  }
  const saved = income - spending;
  return { income, spending, invested, saved, rate: income > 0 ? saved / income : null };
}

function byCategory(moves: Movement[], month: string, cat: CatOpts) {
  const map = new Map<CategoryKey, { total: number; count: number }>();
  for (const m of moves) {
    if (m.kind !== "out" || m.currency !== "EUR" || m.date.slice(0, 7) !== month) continue;
    const k = categorize(m, cat);
    const cur = map.get(k) ?? { total: 0, count: 0 };
    cur.total -= m.amount;
    cur.count++;
    map.set(k, cur);
  }
  return map;
}

/** Mesi interi di cui si può fare il report, dal più recente. */
export function reportMonths(moves: Movement[], today: string): string[] {
  return completeMonths(moves, today.slice(0, 7)).reverse();
}

export function monthReport(moves: Movement[], month: string, today: string, cat: CatOpts = {}, goal: number | null = null): MonthReport {
  const prevMonth = addMonths(month, -1);
  const prevComplete = completeMonths(moves, today.slice(0, 7)).includes(prevMonth);
  const now = byCategory(moves, month, cat);
  const before = prevComplete ? byCategory(moves, prevMonth, cat) : null;
  const categories = [...now.entries()]
    .map(([key, v]) => ({ key, ...CATEGORIES[key], total: v.total, count: v.count, prev: before ? (before.get(key)?.total ?? 0) : null }))
    .sort((a, b) => (a.key === "altro" ? 1 : b.key === "altro" ? -1 : b.total - a.total));
  const biggest = moves
    .filter((m) => m.kind === "out" && m.currency === "EUR" && m.date.slice(0, 7) === month)
    .sort((a, b) => a.amount - b.amount)
    .slice(0, 5)
    .map((m) => ({ party: displayParty(m.party), date: m.date, amount: -m.amount, category: categorize(m, cat) }));
  const totals = totalsOf(moves, month);
  return {
    month,
    totals,
    prev: prevComplete ? totalsOf(moves, prevMonth) : null,
    categories,
    biggest,
    goal: goal ? { amount: goal, reached: totals.saved >= goal } : null,
  };
}

const eur0 = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(n);
const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("it-IT", { month: "long", timeZone: "UTC" });

/** Testo della notifica del 1° del mese: tre numeri e le tre categorie più care. */
export function reportMessage(r: MonthReport): { title: string; body: string } {
  const t = r.totals;
  const top = r.categories.filter((c) => c.key !== "altro").slice(0, 3);
  const goal = r.goal ? (r.goal.reached ? " ✓ obiettivo" : ` (obiettivo ${eur0(r.goal.amount)})`) : "";
  return {
    title: `Report di ${monthLabel(r.month)}`,
    body:
      `Entrate ${eur0(t.income)}, uscite ${eur0(t.spending)}, ${t.saved >= 0 ? "risparmiati" : "in rosso di"} ${eur0(Math.abs(t.saved))}${goal}.` +
      (top.length ? ` Di più: ${top.map((c) => `${c.label} ${eur0(c.total)}`).join(", ")}.` : ""),
  };
}

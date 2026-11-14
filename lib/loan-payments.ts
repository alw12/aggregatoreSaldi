/** Rate scalate in automatico dal debito quando passano sul conto: logica pura (testata in loan-payments.test.ts). */

import type { Movement } from "./flows";

export type AutoPay = {
  since: string; // YYYY-MM-DD: contano solo le rate da questa data (l'importo inserito include quelle prima)
  paid: string[]; // mesi YYYY-MM già scalati
  last: string | null; // data dell'ultima rata scalata
};

type Payable = { amount: number; installment?: number | null; autoPay?: AutoPay | null };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Il movimento è la rata? Uscita in EUR con lo stesso importo, al centesimo. */
export function isInstallment(m: Movement, installment: number): boolean {
  return m.currency === "EUR" && m.amount < 0 && Math.abs(-m.amount - installment) < 0.005;
}

/**
 * Rate passate e non ancora scalate, al massimo una per mese: lo stesso addebito visto prima
 * "in attesa" e poi contabilizzato (con id diversi) non conta due volte.
 */
export function newInstallments(installment: number, auto: AutoPay, moves: Movement[]): { month: string; date: string }[] {
  const paid = new Set(auto.paid);
  const found = new Map<string, string>();
  for (const m of moves) {
    if (m.date < auto.since || !isInstallment(m, installment)) continue;
    const month = m.date.slice(0, 7);
    if (paid.has(month)) continue;
    const prev = found.get(month);
    if (!prev || m.date < prev) found.set(month, m.date);
  }
  return [...found].map(([month, date]) => ({ month, date })).sort((a, b) => a.month.localeCompare(b.month));
}

/** Debito con le rate nuove scalate; null se non c'è niente da scalare. */
export function applyInstallments<T extends Payable>(debt: T, moves: Movement[]): T | null {
  const { installment, autoPay } = debt;
  if (!autoPay || !installment || installment <= 0 || debt.amount <= 0) return null;
  const found = newInstallments(installment, autoPay, moves);
  if (!found.length) return null;
  return {
    ...debt,
    amount: Math.max(0, round2(debt.amount - installment * found.length)),
    autoPay: {
      since: autoPay.since,
      paid: [...autoPay.paid, ...found.map((f) => f.month)].slice(-60),
      last: found.at(-1)!.date,
    },
  };
}

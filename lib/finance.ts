/** Matematica finanziaria pura, condivisa da simulatore e piano dei debiti (testata in finance.test.ts). */

export const TARGET = 1_000_000;

/** Tasso mensile equivalente a un tasso annuo composto (in %). */
export const monthlyRate = (annualPct: number) => Math.pow(1 + annualPct / 100, 1 / 12) - 1;

/** Valore dopo m mesi partendo da P e versando C a fine mese. */
export function futureValue(P: number, C: number, annualPct: number, m: number) {
  const i = monthlyRate(annualPct);
  if (i === 0) return P + C * m;
  const g = Math.pow(1 + i, m);
  return P * g + (C * (g - 1)) / i;
}

/** Mesi per arrivare a `target`; null se non ci si arriva entro 100 anni. */
export function monthsToTarget(P: number, C: number, annualPct: number, target = TARGET) {
  if (P >= target) return 0;
  for (let m = 1; m <= 1200; m++) if (futureValue(P, C, annualPct, m) >= target) return m;
  return null;
}

/** Versamento mensile che serve per arrivare a `target` in `years` anni. */
export function monthlyNeeded(P: number, annualPct: number, years: number, target = TARGET) {
  const n = years * 12;
  const i = monthlyRate(annualPct);
  const g = i === 0 ? 1 : Math.pow(1 + i, n);
  const rest = target - P * g;
  if (rest <= 0) return 0;
  return i === 0 ? rest / n : (rest * i) / (g - 1);
}

export type Payoff = { months: number; interest: number } | null;

/**
 * Ammortamento alla francese: mesi e interessi che restano per estinguere `balance`
 * pagando `installment` al mese al TAEG `taegPct`. null se la rata non copre nemmeno gli interessi.
 * Il TAEG include le spese: usarlo come tasso dà una stima prudente degli interessi.
 */
export function payoff(balance: number, installment: number, taegPct: number): Payoff {
  if (balance <= 0) return { months: 0, interest: 0 };
  if (installment <= 0) return null;
  const i = monthlyRate(taegPct);
  if (i > 0 && installment <= balance * i) return null;
  let rest = balance;
  let interest = 0;
  let months = 0;
  while (rest > 0.005 && months < 1200) {
    const due = rest * i;
    interest += due;
    rest = rest + due - installment;
    months++;
  }
  return { months, interest };
}

/** Penale massima di estinzione anticipata per i crediti ai consumatori (art. 125-sexies TUB). */
export function earlyRepaymentFee(amount: number, residual: number, monthsLeft: number) {
  // Nessuna penale se si estingue tutto con un residuo fino a 10.000 €
  if (amount >= residual && residual <= 10_000) return 0;
  return amount * (monthsLeft > 12 ? 0.01 : 0.005);
}

/** Interessi risparmiati restituendo `extra` subito, a parità di rata. */
export function prepaymentSaving(balance: number, installment: number, taegPct: number, extra: number) {
  const base = payoff(balance, installment, taegPct);
  const after = payoff(Math.max(0, balance - extra), installment, taegPct);
  if (!base || !after) return null;
  return {
    monthsSaved: base.months - after.months,
    interestSaved: base.interest - after.interest,
    fee: earlyRepaymentFee(extra, balance, base.months),
    after,
  };
}

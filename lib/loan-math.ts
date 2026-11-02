/** Calcoli su un prestito a rata costante (ammortamento alla francese). Senza dipendenze, testabile con `npm test`. */
export type LoanTerms = {
  principal: number; // importo finanziato
  installment: number; // rata mensile
  count: number; // numero totale di rate
  firstDue: string; // data della prima rata, YYYY-MM-DD
};

export type LoanStatus = {
  paid: number;
  left: number;
  nextDue: string | null;
  lastDue: string;
  remaining: number; // somma delle rate ancora da pagare
  residual: number; // debito residuo stimato, cioè quanto costerebbe estinguere oggi
};

/** Scadenza della rata i (0 = prima): stesso giorno del mese della prima, o l'ultimo giorno nei mesi più corti. */
export function dueDate(firstDue: string, i: number): string {
  const [y, m, d] = firstDue.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m + i, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + i, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

/** Tasso mensile implicito nella rata (bisezione): comprende anche i costi inclusi nella rata. */
export function impliedMonthlyRate({ principal, installment, count }: LoanTerms): number {
  if (installment * count <= principal) return 0;
  const pv = (r: number) => (installment * (1 - (1 + r) ** -count)) / r;
  let lo = 1e-9;
  let hi = 1;
  for (let k = 0; k < 100; k++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > principal) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function loanStatus(t: LoanTerms, today: string): LoanStatus {
  let paid = 0;
  while (paid < t.count && dueDate(t.firstDue, paid) <= today) paid++;
  const left = t.count - paid;
  const r = impliedMonthlyRate(t);
  return {
    paid,
    left,
    nextDue: left > 0 ? dueDate(t.firstDue, paid) : null,
    lastDue: dueDate(t.firstDue, t.count - 1),
    remaining: left * t.installment,
    residual: r === 0 ? left * t.installment : (t.installment * (1 - (1 + r) ** -left)) / r,
  };
}

/** "2028-10-30" → "30/10/2028" */
export const itDate = (iso: string) => iso.split("-").reverse().join("/");

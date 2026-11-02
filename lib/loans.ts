import "server-only";
import { redis } from "./store";
import { loanStatus, type LoanStatus, type LoanTerms } from "./loan-math";

/** Un prestito inserito a mano; `id` è il nome scelto dall'utente. */
export type Loan = LoanTerms & { id: string; updatedAt: string };
export type LoanView = Loan & LoanStatus;

const KEY = "saldi:loans";

export async function loadLoans(): Promise<LoanView[]> {
  const r = redis();
  if (!r) return [];
  const data = await r.hgetall<Record<string, Loan>>(KEY);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
  return Object.values(data ?? {})
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((l) => ({ ...l, ...loanStatus(l, today) }));
}

export async function saveLoan(l: Loan): Promise<void> {
  const r = redis();
  if (!r) throw new Error("Storage non configurato");
  await r.hset(KEY, { [l.id]: l });
}

export async function removeLoan(id: string): Promise<void> {
  const r = redis();
  if (!r) return;
  await r.hdel(KEY, id);
}

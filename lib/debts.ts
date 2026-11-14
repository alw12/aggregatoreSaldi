import "server-only";
import { redis } from "./store";
import type { Movement } from "./flows";
import { applyInstallments, type AutoPay } from "./loan-payments";

/** Debito registrato a mano: sottratto dal patrimonio netto, con un contatore separato in panoramica. */
export type Debt = {
  id: string;
  name: string; // a chi / per cosa
  amount: number; // EUR ancora da restituire
  dueDate: string | null; // YYYY-MM-DD
  note: string | null;
  rate?: number | null; // TAEG annuo in %, per i prestiti
  installment?: number | null; // rata mensile in EUR
  autoPay?: AutoPay | null; // scala la rata dall'importo quando passa sul conto
  updatedAt: string;
};

const KEY = "saldi:debts";
const LOCK = "saldi:debts:autopay-lock";

export async function listDebts(): Promise<Debt[]> {
  const r = redis();
  if (!r) return [];
  const data = await r.hgetall<Record<string, Debt>>(KEY);
  return Object.values(data ?? {}).sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
}

export async function getDebt(id: string): Promise<Debt | null> {
  const r = redis();
  if (!r) return null;
  return (await r.hget<Debt>(KEY, id)) ?? null;
}

export async function saveDebt(d: Debt): Promise<void> {
  const r = redis();
  if (!r) throw new Error("Storage non configurato");
  await r.hset(KEY, { [d.id]: d });
}

export async function removeDebt(id: string): Promise<void> {
  const r = redis();
  if (!r) return;
  await r.hdel(KEY, id);
}

/**
 * Scala dai debiti con `autoPay` le rate trovate tra i movimenti (stesso importo, una per mese).
 * Il lock evita che due pagine aperte insieme scalino la stessa rata due volte.
 */
export async function applyLoanPayments(moves: Movement[]): Promise<number> {
  const r = redis();
  if (!r || !moves.length) return 0;
  const candidates = (await listDebts()).filter((d) => d.autoPay && d.installment && d.amount > 0);
  if (!candidates.length) return 0;
  if (!(await r.set(LOCK, "1", { nx: true, ex: 15 }))) return 0;
  try {
    let changed = 0;
    for (const { id } of candidates) {
      const fresh = await getDebt(id);
      const next = fresh && applyInstallments(fresh, moves);
      if (!next) continue;
      await saveDebt({ ...next, updatedAt: new Date().toISOString() });
      changed++;
    }
    return changed;
  } finally {
    await r.del(LOCK);
  }
}

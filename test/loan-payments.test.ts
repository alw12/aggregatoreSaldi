import { describe, expect, it } from "vitest";
import { applyInstallments, newInstallments } from "@/lib/loan-payments";
import type { Movement } from "@/lib/flows";

const mv = (id: string, date: string, amount: number, party = "FCA BANK SDD"): Movement => ({
  id, date, amount, currency: "EUR", party, account: "Banca, Conto", kind: amount < 0 ? "out" : "in",
});

const car = { amount: 10_000, installment: 281.82, autoPay: { since: "2026-11-01", paid: [] as string[], last: null } };

describe("rate scalate in automatico", () => {
  it("scala la rata quando passa, al centesimo", () => {
    const next = applyInstallments(car, [mv("a", "2026-11-05", -281.82), mv("b", "2026-11-06", -281.8), mv("c", "2026-11-07", 281.82)]);
    expect(next?.amount).toBe(9718.18);
    expect(next?.autoPay).toEqual({ since: "2026-11-01", paid: ["2026-11"], last: "2026-11-05" });
  });
  it("non scala due volte lo stesso mese (in attesa e poi contabilizzato, o pagina riletta)", () => {
    const moves = [mv("pending", "2026-11-05", -281.82), mv("booked", "2026-11-06", -281.82)];
    const once = applyInstallments(car, moves)!;
    expect(once.amount).toBe(9718.18);
    expect(applyInstallments(once, moves)).toBeNull();
  });
  it("ignora le rate prima dell'attivazione e scala quelle nuove dei mesi dopo", () => {
    const moves = [mv("old", "2026-10-05", -281.82), mv("nov", "2026-11-05", -281.82), mv("dec", "2026-12-05", -281.82)];
    expect(newInstallments(281.82, car.autoPay, moves).map((f) => f.month)).toEqual(["2026-11", "2026-12"]);
    expect(applyInstallments(car, moves)?.amount).toBe(9436.36);
  });
  it("non va sotto zero e non tocca i debiti senza autoPay", () => {
    expect(applyInstallments({ ...car, amount: 100 }, [mv("a", "2026-11-05", -281.82)])?.amount).toBe(0);
    expect(applyInstallments({ ...car, autoPay: null }, [mv("a", "2026-11-05", -281.82)])).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import type { Movement } from "@/lib/flows";
import { deductionType, findDeductions, isDuplicate, summarizeDeductions, type Deduction } from "@/lib/deductions";

const mv = (id: string, date: string, amount: number, party: string, kind: Movement["kind"] = "out"): Movement => ({ id, date, amount, currency: "EUR", party, account: "B, C", kind });
const d = (p: Partial<Deduction>): Deduction => ({ id: Math.random().toString(), date: "2026-10-07", amount: 10, party: "Farmacia", type: "sanitaria", source: "auto", excluded: false, ...p });

describe("spese per il 730", () => {
  it("riconosce farmacia, medico, ottico, veterinario; non barbiere né profumeria", () => {
    expect(deductionType("Antica Farmacia Giuseppe")).toBe("sanitaria");
    expect(deductionType("Studio Medico Rossi")).toBe("sanitaria");
    expect(deductionType("Ottica Bianchi")).toBe("sanitaria");
    expect(deductionType("Clinica Veterinaria San Marco")).toBe("veterinaria");
    expect(deductionType("Salone 198")).toBeNull();
    expect(deductionType("Profumeria Douglas")).toBeNull();
    expect(deductionType("Mediaworld")).toBeNull();
    expect(deductionType("Martinucci Laboratory")).toBeNull();
    expect(deductionType("Centro Analisi Cliniche")).toBe("sanitaria");
  });
  it("solo uscite in EUR", () => {
    const found = findDeductions([mv("1", "2026-10-07", -24.75, "Antica Farmacia Giuseppe"), mv("2", "2026-10-08", 5, "Farmacia rimborso", "in"), mv("3", "2026-10-09", -9, "Conad")]);
    expect(found.map((x) => [x.id, x.amount])).toEqual([["1", 24.75]]);
  });
  it("lo stesso addebito in attesa e poi contabilizzato conta una volta", () => {
    const a = d({ id: "a", date: "2026-10-07", amount: 24.75, party: "Antica Farmacia Giuseppe" });
    expect(isDuplicate(d({ id: "b", date: "2026-10-08", amount: 24.75, party: "ANTICA FARMACIA GIUSEPPE" }), [a])).toBe(true);
    expect(isDuplicate(d({ id: "c", date: "2026-10-20", amount: 24.75, party: "Antica Farmacia Giuseppe" }), [a])).toBe(false);
  });
  it("19% oltre 129,11 €; veterinarie fino a 550 €; le escluse non contano", () => {
    const s = summarizeDeductions([
      d({ amount: 300 }),
      d({ amount: 50, excluded: true }),
      d({ type: "veterinaria", amount: 800 }),
    ]);
    expect(s.health).toBe(300);
    expect(s.healthBack).toBeCloseTo((300 - 129.11) * 0.19);
    expect(s.vetBack).toBeCloseTo((550 - 129.11) * 0.19);
    expect(summarizeDeductions([d({ amount: 100 })]).back).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { averageMonth, classify, monthlyFlows, topSpending, type Movement } from "@/lib/flows";

const mv = (date: string, amount: number, party: string, kind = classify(amount, party, null, new Set())): Movement => ({
  id: `${date}${party}${amount}`, date, amount, currency: "EUR", party, account: "Banca, Conto", kind,
});

describe("movimenti", () => {
  it("classifica giroconti, investimenti, entrate e uscite", () => {
    const own = new Set(["IT60X0542811101000000123456"]);
    expect(classify(-100, "Mario", "IT60 X054 2811 1010 0000 0123 456", own)).toBe("internal");
    expect(classify(-300, "Scalable Capital GmbH", null, own)).toBe("invest");
    expect(classify(-300, "Trade Republic Bank", null, own)).toBe("invest");
    expect(classify(1500, "Stipendio ACME", null, own)).toBe("in");
    expect(classify(-40, "Esselunga", null, own)).toBe("out");
    expect(classify(-5.98, "Risparmio Casa", null, own)).toBe("invest");
  });
  it("somma per mese, esclude giroconti, calcola il tasso di risparmio", () => {
    const flows = monthlyFlows([
      mv("2026-08-27", 1500, "Stipendio"),
      mv("2026-08-28", -900, "Affitto"),
      mv("2026-08-29", -300, "Scalable Capital"),
      mv("2026-08-30", -200, "Giroconto", "internal"),
      mv("2026-09-27", 1500, "Stipendio"),
      mv("2026-09-28", -1200, "Affitto"),
    ]);
    expect(flows).toEqual([
      { month: "2026-08", income: 1500, spending: 900, invested: 300, saved: 600, rate: 0.4 },
      { month: "2026-09", income: 1500, spending: 1200, invested: 0, saved: 300, rate: 0.2 },
    ]);
  });
  it("media: solo mesi completi, salta il primo se ce ne sono altri", () => {
    const flows = monthlyFlows([
      mv("2026-06-25", 100, "Stipendio"),
      mv("2026-07-25", 1000, "Stipendio"),
      mv("2026-08-25", 2000, "Stipendio"),
      mv("2026-10-02", 5000, "Stipendio"),
    ]);
    expect(averageMonth(flows, "2026-10")).toEqual({ income: 1500, spending: 0, saved: 1500, months: 2 });
  });
  it("dove vanno i soldi: per controparte, dal più grande", () => {
    const top = topSpending([mv("2026-10-01", -10, "Bar"), mv("2026-10-02", -15, "bar"), mv("2026-10-03", -20, "Esselunga"), mv("2026-09-01", -99, "Vecchio")], "2026-09-15");
    expect(top).toEqual([
      { party: "Bar", total: 25, count: 2 },
      { party: "Esselunga", total: 20, count: 1 },
    ]);
  });
});

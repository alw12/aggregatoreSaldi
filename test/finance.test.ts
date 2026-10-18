import { describe, expect, it } from "vitest";
import { earlyRepaymentFee, futureValue, monthlyNeeded, monthsToTarget, payoff, prepaymentSaving } from "@/lib/finance";

describe("interesse composto", () => {
  it("a tasso zero somma e basta", () => {
    expect(futureValue(1000, 100, 0, 12)).toBe(2200);
  });
  it("12 mesi al 12% annuo fanno +12% sul capitale", () => {
    expect(futureValue(1000, 0, 12, 12)).toBeCloseTo(1120, 6);
  });
  it("monthlyNeeded e monthsToTarget sono coerenti", () => {
    const c = monthlyNeeded(0, 5, 30);
    expect(monthsToTarget(0, c, 5)).toBe(360);
    expect(futureValue(0, c, 5, 360)).toBeCloseTo(1_000_000, 0);
  });
  it("già sopra il milione: 0 mesi e 0 al mese", () => {
    expect(monthsToTarget(2_000_000, 0, 5)).toBe(0);
    expect(monthlyNeeded(2_000_000, 5, 10)).toBe(0);
  });
  it("irraggiungibile in 100 anni: null", () => {
    expect(monthsToTarget(0, 10, 0)).toBeNull();
  });
});

describe("piano del prestito", () => {
  it("senza interessi: debito / rata, arrotondato in su", () => {
    expect(payoff(1000, 300, 0)).toEqual({ months: 4, interest: 0 });
  });
  it("rata che non copre gli interessi: null", () => {
    expect(payoff(10_000, 50, 10)).toBeNull();
  });
  it("con interessi: interessi totali = rate pagate − capitale", () => {
    const p = payoff(7045.5, 200, 9.9)!;
    expect(p.months).toBeGreaterThan(36);
    expect(p.months).toBeLessThan(45);
    expect(p.interest).toBeGreaterThan(900);
    expect(p.interest).toBeLessThan(1600);
  });
  it("restituire prima accorcia e risparmia interessi", () => {
    const s = prepaymentSaving(7045.5, 200, 9.9, 2000)!;
    expect(s.monthsSaved).toBeGreaterThan(8);
    expect(s.interestSaved).toBeGreaterThan(300);
  });
  it("penale art. 125-sexies TUB", () => {
    expect(earlyRepaymentFee(7000, 7000, 30)).toBe(0); // estinzione totale sotto i 10.000 €
    expect(earlyRepaymentFee(2000, 7000, 30)).toBe(20); // 1% oltre un anno
    expect(earlyRepaymentFee(2000, 7000, 10)).toBe(10); // 0,5% entro un anno
    expect(earlyRepaymentFee(15_000, 15_000, 30)).toBe(150);
  });
});

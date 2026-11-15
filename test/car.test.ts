import { describe, expect, it } from "vitest";
import type { Movement } from "@/lib/flows";
import { carCost, carPart, guessCarLoan, EMPTY_CAR } from "@/lib/car";

let n = 0;
const mv = (date: string, amount: number, party: string, kind: Movement["kind"] = amount >= 0 ? "in" : "out"): Movement => ({
  id: String(n++), date, amount, currency: "EUR", party, account: "Revolut, Conto", kind,
});

// Dal 20 agosto: settembre e ottobre interi, novembre in corso
const moves = [
  mv("2026-08-20", -38.01, "Delta Petroli"),
  mv("2026-09-10", -99.3, "UnipolTech"),
  mv("2026-09-19", -55.01, "Metano Toscana - Empol"),
  mv("2026-09-29", -43.01, "Eni 04836"),
  mv("2026-09-30", -281.82, "RATA FINANZIAMENTO COMPASS BANCA S.P.A."),
  mv("2026-10-15", -24.2, "UnipolTech"),
  mv("2026-10-19", -52.01, "Eni Pv - 04836"),
  mv("2026-10-30", -281.82, "RATA FINANZIAMENTO COMPASS BANCA S.P.A."),
  mv("2026-10-20", -12, "Trenitalia"),
  mv("2026-11-09", -44.01, "Metano Toscana - Empol"),
  mv("2026-11-14", -61.14, "New Gas Network Di Mando"),
  mv("2026-11-11", -10.2, "UnipolTech"),
  mv("2026-11-12", -19.25, "Mc Donald S"),
];
const loan = { installment: 281.82, amount: 6000 };

describe("costo dell'auto", () => {
  it("riconosce carburante, Telepass, rata; il treno e il resto no", () => {
    expect(carPart(moves[2], null)).toBe("carburante");
    expect(carPart(moves[1], null)).toBe("pedaggi");
    expect(carPart(moves[4], 281.82)).toBe("rata");
    expect(carPart(moves[8], null)).toBeNull();
    expect(carPart(moves[12], null)).toBeNull();
  });
  it("una correzione di categoria diversa da Trasporti la toglie dall'auto", () => {
    expect(carPart(moves[1], null, { unipoltech: "abbonamenti" })).toBeNull();
    expect(carPart(moves[1], null, { unipoltech: "trasporti" })).toBe("pedaggi");
  });
  it("media dei mesi interi, rata dal debito, spese annuali ÷ 12, costo al km", () => {
    const c = carCost(moves, "2026-11-15", { ...EMPTY_CAR, annual: { assicurazione: 600 }, kmYear: 12000 }, loan);
    const by = Object.fromEntries(c.lines.map((l) => [l.part, l.monthly]));
    expect(c.basis).toBe(2);
    expect(by.rata).toBeCloseTo(281.82);
    expect(by.carburante).toBeCloseTo((55.01 + 43.01 + 52.01) / 2);
    expect(by.pedaggi).toBeCloseTo((99.3 + 24.2) / 2);
    expect(by.assicurazione).toBe(50);
    expect(c.monthly).toBeCloseTo(281.82 + 75.015 + 61.75 + 50);
    expect(c.withoutLoan).toBeCloseTo(c.monthly - 281.82);
    expect(c.perKm).toBeCloseTo((c.monthly * 12) / 12000);
    expect(c.thisMonth).toBeCloseTo(44.01 + 61.14 + 10.2);
  });
  it("debito estinto: niente rata", () => {
    const c = carCost(moves, "2026-11-15", EMPTY_CAR, { installment: 281.82, amount: 0 });
    expect(c.lines.find((l) => l.part === "rata")).toBeUndefined();
  });
  it("indovina il debito dell'auto dal nome", () => {
    expect(guessCarLoan([{ id: "a", name: "Prestito Marco", installment: null, amount: 50 }, { id: "b", name: "Compass auto", installment: 281.82, amount: 6000 }])?.id).toBe("b");
  });
});

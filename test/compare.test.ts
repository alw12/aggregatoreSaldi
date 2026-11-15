import { describe, expect, it } from "vitest";
import type { Movement } from "@/lib/flows";
import { biggestChanges, compareCategories, previousPeriod } from "@/lib/compare";

let n = 0;
const mv = (date: string, amount: number, party: string): Movement => ({ id: String(n++), date, amount, currency: "EUR", party, account: "B, C", kind: amount >= 0 ? "in" : "out" });

const moves = [
  mv("2026-08-18", -10, "Conad"),
  mv("2026-10-05", -100, "Conad"),
  mv("2026-10-10", -50, "Pizzeria Da Mario"),
  mv("2026-10-20", -200, "Pizzeria Da Mario"),
  mv("2026-10-12", -30, "Eni"),
  mv("2026-11-03", -40, "Conad"),
  mv("2026-11-08", -120, "Pizzeria Da Mario"),
];

describe("confronto con il periodo prima", () => {
  it("mese in corso: lo stesso tratto del mese prima", () => {
    expect(previousPeriod("2026-11", "2026-11-15", moves)).toEqual({ from: "2026-10-01", to: "2026-10-15", label: "rispetto a ottobre fino al 15" });
  });
  it("mese passato: il mese prima intero; 30 giorni: i 30 prima", () => {
    expect(previousPeriod("2026-10", "2026-11-15", moves)).toMatchObject({ from: "2026-09-01", to: "2026-09-30", label: "rispetto a settembre" });
    expect(previousPeriod("30", "2026-11-15", moves)).toMatchObject({ from: "2026-09-15", to: "2026-10-15" });
  });
  it("niente confronto se il periodo prima non è stato letto tutto", () => {
    expect(previousPeriod("2026-09", "2026-11-15", moves)).toBeNull();
  });
  it("differenze per categoria, anche quelle sparite", () => {
    const prev = previousPeriod("2026-11", "2026-11-15", moves)!;
    const ch = compareCategories(moves, "2026-11-01", "2026-11-15", prev);
    const by = Object.fromEntries(ch.map((c) => [c.key, [c.now, c.before, c.delta]]));
    // Fino al 15 ottobre: Conad 100, pizzeria 50, Eni 30 (la pizzeria del 20 no)
    expect(by.ristoranti).toEqual([120, 50, 70]);
    expect(by.spesa).toEqual([40, 100, -60]);
    expect(by.trasporti).toEqual([0, 30, -30]);
    const big = biggestChanges(ch);
    expect(big.up.map((c) => c.key)).toEqual(["ristoranti"]);
    expect(big.down.map((c) => c.key)).toEqual(["spesa"]);
  });
});

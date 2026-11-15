import { describe, expect, it } from "vitest";
import type { Movement } from "@/lib/flows";
import { monthReport, reportMessage, reportMonths } from "@/lib/report";

let n = 0;
const mv = (date: string, amount: number, party: string, kind: Movement["kind"] = amount >= 0 ? "in" : "out"): Movement => ({
  id: String(n++), date, amount, currency: "EUR", party, account: "B, C", kind,
});

const moves = [
  mv("2026-08-18", -40, "Conad"),
  mv("2026-09-02", -450, "Affitto Rossi"),
  mv("2026-09-10", -100, "Pizzeria Da Mario"),
  mv("2026-09-27", 1900, "Stipendio"),
  mv("2026-10-02", -450, "Affitto Rossi"),
  mv("2026-10-08", -60, "Conad"),
  mv("2026-10-10", -150, "Pizzeria Da Mario"),
  mv("2026-10-11", -100, "Giroconto", "internal"),
  mv("2026-10-15", -50, "Scalable", "invest"),
  mv("2026-10-27", 1950, "Stipendio"),
  mv("2026-10-28", -500, "Mario Bianchi"),
  mv("2026-11-03", -20, "Bar"),
];

describe("report del mese", () => {
  it("solo i mesi interi, dal più recente", () => {
    expect(reportMonths(moves, "2026-11-01")).toEqual(["2026-10", "2026-09"]);
  });
  it("totali, confronto con il mese prima, categorie e spese più grandi", () => {
    const r = monthReport(moves, "2026-10", "2026-11-01", {}, 1300);
    expect(r.totals).toMatchObject({ income: 1950, spending: 1160, invested: 50, saved: 790 });
    expect(r.prev).toMatchObject({ income: 1900, spending: 550 });
    // Altro sempre in fondo, anche se è la più grande
    expect(r.categories.map((c) => [c.key, c.total, c.prev])).toEqual([["casa", 450, 450], ["ristoranti", 150, 100], ["spesa", 60, 0], ["altro", 500, 0]]);
    expect(r.biggest[0]).toMatchObject({ amount: 500, party: "Mario Bianchi" });
    expect(r.goal).toEqual({ amount: 1300, reached: false });
  });
  it("il primo mese intero non ha confronto", () => {
    expect(monthReport(moves, "2026-09", "2026-11-01").prev).toBeNull();
  });
  it("notifica: tre numeri e le tre categorie più care, Altro escluso", () => {
    const r = reportMessage(monthReport(moves, "2026-10", "2026-11-01"));
    const m = { ...r, body: r.body.replace(/\u00a0/g, " ") };
    expect(m.title).toBe("Report di ottobre");
    expect(m.body).toContain("Entrate 1.950 €, uscite 1.160 €, risparmiati 790 €.");
    expect(m.body).toContain("Di più: Casa e bollette 450 €, Ristoranti e bar 150 €, Spesa 60 €.");
    expect(m.body).not.toContain("Altro");
  });
});

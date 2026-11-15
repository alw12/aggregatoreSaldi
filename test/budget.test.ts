import { describe, expect, it } from "vitest";
import type { Movement } from "@/lib/flows";
import { budgetLines, completeMonths, forecastMonth, goalHistory, recurringDue, recurringSpending } from "@/lib/budget";

let n = 0;
const mv = (date: string, amount: number, party: string, kind: Movement["kind"] = amount >= 0 ? "in" : "out"): Movement => ({
  id: String(n++), date, amount, currency: "EUR", party, account: "Banca, Conto", kind,
});

// Dal 18 agosto (finestra della banca) a metà novembre: stipendio il 27, affitto il 2, Netflix il 10, spesa varia
const moves: Movement[] = [
  mv("2026-08-18", -40, "Conad"),
  mv("2026-08-27", 1900, "Stipendio ACME"),
  ...["09", "10", "11"].flatMap((m) => [
    mv(`2026-${m}-02`, -450, "Bonifico a favore di Mario Rossi affitto"),
    mv(`2026-${m}-10`, -13.99, "NETFLIX.COM 12345"),
    mv(`2026-${m}-05`, -60, "Conad"),
    mv(`2026-${m}-20`, -25.5, "Bar Sport"),
  ]),
  mv("2026-09-22", -3.2, "Bar Sport"),
  mv("2026-09-27", 1900, "Stipendio ACME"),
  mv("2026-10-27", 1950, "Stipendio ACME"),
  mv("2026-10-15", -200, "Scalable Capital", "invest"),
  mv("2026-11-04", -100, "Giroconto", "internal"),
  // Lo stesso addebito visto in attesa e poi contabilizzato
  mv("2026-11-11", -13.99, "NETFLIX.COM 12345"),
];

describe("budget", () => {
  it("mesi interi: il primo parziale non conta, quello in corso nemmeno", () => {
    expect(completeMonths(moves, "2026-11")).toEqual(["2026-09", "2026-10"]);
  });

  it("previsione: le spese dopo oggi e lo stipendio non ancora arrivato contano", () => {
    const f = forecastMonth(moves, "2026-11-15");
    expect(f.basis).toBe(2);
    expect(f.spending.sofar).toBeCloseTo(450 + 13.99 + 13.99 + 60);
    // Dopo il 15 di solito arriva solo il bar (25,5 il 20; 3,2 il 22 di settembre)
    expect(f.spending.expected - f.spending.sofar).toBeCloseTo(25.5 + 3.2 / 2);
    expect(f.income.expected).toBeCloseTo(1925);
    expect(f.daysLeft).toBe(16);
  });

  it("ricorrenti: affitto e Netflix sì, il bar con importi diversi e la spesa una tantum no", () => {
    const rec = recurringSpending(moves, "2026-11-15");
    const names = rec.map((r) => r.party);
    expect(names).toContain("Bonifico a favore di Mario Rossi affitto");
    expect(names.some((p) => p.startsWith("NETFLIX"))).toBe(true);
    // Conad: 60 € ogni mese il 5 → anche lei ricorrente; il bar ha 25,5 tre volte e 3,2 una
    expect(rec.find((r) => r.party.startsWith("NETFLIX"))).toMatchObject({ amount: 13.99, months: 3, next: "2026-12-10" });
    expect(rec.filter((r) => r.party === "Bar Sport")).toHaveLength(1);
    expect(rec[0].party).toContain("affitto");
  });

  it("ricorrenti ancora da pagare nel mese", () => {
    const rec = recurringSpending(moves.filter((m) => m.date < "2026-11-01"), "2026-11-01");
    expect(recurringDue(rec, "2026-11-01").map((r) => r.amount).sort((a, b) => a - b)).toEqual([13.99, 25.5, 60, 450]);
  });

  it("budget per categoria: speso nel mese e media dei mesi interi", () => {
    const [spesa] = budgetLines(moves, { spesa: 100 }, "2026-11-15");
    expect(spesa).toMatchObject({ key: "spesa", limit: 100, spent: 60, usual: 60 });
  });

  it("obiettivo: entrate meno uscite, il messo da parte non è una spesa", () => {
    const h = goalHistory(moves, 1300, "2026-11-15");
    expect(h.map((x) => x.month)).toEqual(["2026-09", "2026-10"]);
    expect(h[0].saved).toBeCloseTo(1900 - 450 - 13.99 - 60 - 25.5 - 3.2);
    expect(h[0].reached).toBe(true);
    expect(h[1].saved).toBeCloseTo(1950 - 450 - 13.99 - 60 - 25.5);
  });
});

describe("nomi leggibili", () => {
  it("toglie data, operazione, carta e codici SEPA", async () => {
    const { displayParty } = await import("@/lib/budget");
    expect(displayParty("PAGAMENTO POS WWW.ALPSIM.IT 09/11/2026 09.04 MERANO Op.680229 carta ****2593")).toBe("Alpsim.it");
    expect(displayParty("DOMICILIAZIONE (ADDEBITO DIRETTO SEPA) FASTWEB SpA CID.IT830010000012878470157 M")).toBe("FASTWEB SpA");
    expect(displayParty("RATA FINANZIAMENTO COMPASS BANCA S.P.A. CID.IT050020000000864530159 MAN.MNDTCO00")).toBe("Rata Finanziamento Compass Banca S.p.a.");
    expect(displayParty("Netflix.com")).toBe("Netflix.com");
  });
});

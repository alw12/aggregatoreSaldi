import { describe, expect, it } from "vitest";
import { computeAlerts } from "@/lib/alerts";
import type { Overview } from "@/lib/overview";

const base = (p: Partial<Overview>): Overview =>
  ({
    banks: [], manual: [], holdings: [], portfolioError: null, bonds: [], cards: [], debts: [], beni: [], history: [], failed: 0,
    accountsCount: 0, oldestFetch: null, otherCurrencies: [], isEmpty: false, today: null, days: [],
    totals: { cash: 500, holdings: 0, holdingsCost: null, holdingsGain: null, bonds: 0, invested: 0, beni: 0, cards: 0, debts: 0, net: 500, netWithBeni: 500 },
    ...p,
  }) as Overview;

describe("avvisi", () => {
  it("consenso in scadenza, carta oltre l'80%, addebito senza liquidità, debito in scadenza", () => {
    const alerts = computeAlerts(
      base({
        banks: [{ sessionId: "s", bank: "BBVA", country: "IT", validUntil: "", daysLeft: 5, expired: false, fetchedAt: null, accounts: [] }],
        cards: [{ id: "c", name: "Amex", last4: null, balance: 900, limit: 1000, chargeDay: 20, updatedAt: "", available: 100, nextCharge: "2026-10-20" }],
        debts: [{ id: "d", name: "Marco", amount: 50, dueDate: "2026-10-22", note: null, updatedAt: "" }],
      }),
      "2026-10-18",
    );
    const keys = alerts.map((a) => a.key);
    expect(keys).toContain("consent:s:14");
    expect(keys).toContain("card:c:2026-10-20");
    expect(keys).toContain("charge:c:2026-10-20");
    expect(keys).toContain("debt:d:2026-10-22");
    // Gli errori (liquidità che non basta) vengono prima
    expect(alerts[0].level).toBe("error");
    expect(alerts.find((a) => a.key.startsWith("charge"))!.text).toContain("la liquidità non basta");
  });
  it("tutto in ordine: nessun avviso", () => {
    expect(computeAlerts(base({}), "2026-10-18")).toEqual([]);
  });
});

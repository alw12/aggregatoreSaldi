import { describe, expect, it } from "vitest";
import { changeSince } from "@/lib/overview";
import { byAssetClass, byInstrument, inferAssetClass, type HoldingView } from "@/lib/portfolio";

const day = (date: string, total: number) => ({ date, total, cash: 0, invested: 0, cards: 0 });

describe("variazione del patrimonio", () => {
  const days = [day("2026-09-10", 100), day("2026-10-01", 200), day("2026-10-11", 250), day("2026-10-18", 300)];
  it("rispetto all'ultima fotografia entro n giorni fa", () => {
    expect(changeSince(days, 7)).toEqual({ delta: 50, from: "2026-10-11" });
    expect(changeSince(days, 30)).toEqual({ delta: 200, from: "2026-09-10" });
  });
  it("storico troppo corto: null", () => {
    expect(changeSince(days, 60)).toBeNull();
    expect(changeSince([], 7)).toBeNull();
  });
});

const h = (p: Partial<HoldingView>): HoldingView => ({
  id: "X", broker: "Trade Republic", symbol: null, name: "X", qty: 1, manualPrice: null, updatedAt: "", price: 1, value: 1,
  priceSource: "live", priceTime: null, cls: "azioni", cost: null, gain: null, ...p,
});

describe("portafoglio", () => {
  it("deduce il tipo dal nome", () => {
    expect(inferAssetClass({ id: "BTC-EUR", name: "Bitcoin" })).toBe("crypto");
    expect(inferAssetClass({ id: "IE00B4ND3602", name: "iShares Physical Gold ETC" })).toBe("oro");
    expect(inferAssetClass({ id: "IE00B3F81R35", name: "iShares Core Euro Corporate Bond" })).toBe("obbligazioni");
    expect(inferAssetClass({ id: "IE00B6R52259", name: "iShares MSCI ACWI" })).toBe("azioni");
  });
  it("somma lo stesso ISIN su più broker; guadagno solo se il costo è noto ovunque", () => {
    const list = byInstrument([
      h({ id: "A", broker: "Trade Republic", qty: 1, value: 110, cost: 100, gain: 10 }),
      h({ id: "A", broker: "Scalable Capital", qty: 2, value: 220, cost: 200, gain: 20 }),
      h({ id: "B", value: 50, cost: null }),
      h({ id: "B", broker: "Scalable Capital", value: 50, cost: 40, gain: 10 }),
    ]);
    expect(list[0]).toMatchObject({ id: "A", qty: 3, value: 330, cost: 300, gain: 30, brokers: ["Trade Republic", "Scalable Capital"] });
    expect(list[1]).toMatchObject({ id: "B", value: 100, cost: null, gain: null });
  });
  it("per tipo, dal più grande, senza le voci a zero", () => {
    expect(byAssetClass([h({ cls: "oro", value: 10 }), h({ cls: "azioni", value: 90 }), h({ cls: "crypto", value: 0 })])).toEqual([
      { cls: "azioni", label: "Azioni", value: 90 },
      { cls: "oro", label: "Oro", value: 10 },
    ]);
  });
});

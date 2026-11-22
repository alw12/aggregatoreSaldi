import { describe, expect, it } from "vitest";
import { parseHicp, wealthImpact, yearlyLoss, type Inflation } from "@/lib/inflation-parse";

// Forma reale della risposta Eurostat prc_hicp_minr (geo=IT, unit=RCH_A e RCH_MV12MAVR), accorciata a 3 mesi
const sample = {
  id: ["freq", "unit", "coicop18", "geo", "time"],
  size: [1, 2, 1, 1, 3],
  updated: "2026-11-18T11:00:00+0100",
  value: { "0": 3.2, "1": 4.2, "2": 5.6, "3": 2.1, "4": 2.3, "5": 2.6 },
  dimension: {
    freq: { category: { index: { M: 0 } } },
    unit: { category: { index: { RCH_A: 0, RCH_MV12MAVR: 1 } } },
    coicop18: { category: { index: { TOTAL: 0 } } },
    geo: { category: { index: { IT: 0 } } },
    time: { category: { index: { "2026-08": 0, "2026-09": 1, "2026-10": 2 } } },
  },
};

describe("parseHicp", () => {
  it("legge la variazione annua mese per mese e la media 12 mesi dell'ultimo", () => {
    const r = parseHicp(sample);
    expect(r.series).toEqual([
      { month: "2026-08", rate: 3.2 },
      { month: "2026-09", rate: 4.2 },
      { month: "2026-10", rate: 5.6 },
    ]);
    expect(r.avg12).toBe(2.6);
    expect(r.updated).toBe("2026-11-18T11:00:00+0100");
    expect(r.index).toEqual([]);
  });

  it("legge anche il livello dell'indice I25", () => {
    const r = parseHicp({
      ...sample,
      size: [1, 3, 1, 1, 3],
      value: { ...sample.value, "6": 127.7, "7": 130.3, "8": 132.0 },
      dimension: { ...sample.dimension, unit: { category: { index: { RCH_A: 0, RCH_MV12MAVR: 1, I25: 2 } } } },
    });
    expect(r.index).toEqual([
      { month: "2026-08", value: 127.7 },
      { month: "2026-09", value: 130.3 },
      { month: "2026-10", value: 132.0 },
    ]);
  });

  it("salta i mesi senza dato e non inventa la media", () => {
    const r = parseHicp({ ...sample, value: { "0": 3.2, "1": 4.2 } });
    expect(r.series.map((p) => p.month)).toEqual(["2026-08", "2026-09"]);
    expect(r.avg12).toBeNull();
  });

  it("funziona anche con una sola unità", () => {
    const r = parseHicp({
      ...sample,
      size: [1, 1, 1, 1, 3],
      value: { "0": 1, "1": 2, "2": 3 },
      dimension: { ...sample.dimension, unit: { category: { index: { RCH_A: 0 } } } },
    });
    expect(r.series.at(-1)).toEqual({ month: "2026-10", rate: 3 });
    expect(r.avg12).toBeNull();
  });
});

describe("wealthImpact", () => {
  const inf: Inflation = {
    series: [{ month: "2026-09", rate: 4 }, { month: "2026-10", rate: 5 }],
    avg12: 2.6,
    index: [{ month: "2026-08", value: 100 }, { month: "2026-09", value: 101 }, { month: "2026-10", value: 105 }],
    updated: null,
  };
  const w = { cash: 10_500, cards: 500, invested: 21_000, debts: 5_250, net: 25_750 };

  it("perdita annua: quanto vale fra un anno ai prezzi di oggi", () => {
    expect(yearlyLoss(10_500, 5)).toBeCloseTo(500, 6);
    expect(yearlyLoss(0, 5)).toBe(0);
  });

  it("applica il tasso dell'ultimo mese a liquidità (senza carte), investimenti, debiti e netto", () => {
    const i = wealthImpact(inf, w, [])!;
    expect(i.rate).toBe(5);
    expect(i.cash.amount).toBe(10_000);
    expect(i.cash.loss).toBeCloseTo(476.19, 2);
    expect(i.invested.loss).toBeCloseTo(1_000, 6);
    expect(i.debts.gain).toBeCloseTo(250, 6);
    // Il netto torna con le parti: liquidità + investito − debiti
    expect(i.net.loss).toBeCloseTo(i.cash.loss + i.invested.loss - i.debts.gain, 6);
    expect(i.real).toBeNull();
  });

  it("variazione reale dalla prima fotografia, ai prezzi dell'ultimo mese pubblicato", () => {
    const days = [{ date: "2026-08-20", total: 20_000 }, { date: "2026-11-22", total: 22_000 }];
    const i = wealthImpact(inf, w, days)!;
    expect(i.real).toEqual({ from: "2026-08-20", nominal: 2_000, real: 1_000, toMonth: "2026-10" });
  });

  it("niente variazione reale se lo storico parte dall'ultimo mese pubblicato o dopo, o non c'è l'indice", () => {
    expect(wealthImpact(inf, w, [{ date: "2026-10-05", total: 1 }, { date: "2026-11-22", total: 2 }])!.real).toBeNull();
    expect(wealthImpact(inf, w, [{ date: "2025-01-05", total: 1 }, { date: "2026-11-22", total: 2 }])!.real).toBeNull();
  });

  it("null senza dati", () => {
    expect(wealthImpact({ ...inf, series: [] }, w, [])).toBeNull();
  });
});

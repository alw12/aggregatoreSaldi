import { describe, expect, it } from "vitest";
import { summarize, type InvRow } from "@/lib/investments";

const row = (p: Partial<InvRow>): InvRow => ({ key: Math.random().toString(), name: "x", type: "Azioni", where: "TR", value: 100, cost: 80, ...p });

describe("investimenti", () => {
  it("totale, guadagno solo sulle righe con versato noto, tipi dal più grande", () => {
    const s = summarize([
      row({ value: 1000, cost: 900 }),
      row({ type: "Crypto", value: 300, cost: null }),
      row({ type: "Buoni postali", value: 2500, cost: 2400 }),
      row({ value: null, cost: 50 }),
    ]);
    expect(s.value).toBe(3800);
    expect(s.cost).toBe(3300);
    expect(s.gain).toBe(200);
    expect(s.partial).toBe(true);
    expect(s.byType.map((t) => [t.type, t.value])).toEqual([["Buoni postali", 2500], ["Azioni", 1000], ["Crypto", 300]]);
  });
  it("niente versato noto: guadagno sconosciuto", () => {
    expect(summarize([row({ cost: null })])).toMatchObject({ cost: null, gain: null });
  });
});

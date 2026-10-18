import { describe, expect, it } from "vitest";
import { parsePositions } from "@/lib/import";

describe("parsePositions", () => {
  it("legge separatori diversi, numeri all'italiana e all'inglese", () => {
    const { positions, skipped } = parsePositions(
      ["ISIN;Quantità;Prezzo medio", "IE00B4L5Y983;2,5;98,40", "IE00B6R52259\t0.315144\t111.0604", "IE00BF4RFH31 0,547645"].join("\n"),
    );
    expect(skipped).toEqual(["ISIN;Quantità;Prezzo medio"]);
    expect(positions).toEqual([
      { id: "IE00B4L5Y983", name: null, qty: 2.5, avgCost: 98.4 },
      { id: "IE00B6R52259", name: null, qty: 0.315144, avgCost: 111.0604 },
      { id: "IE00BF4RFH31", name: null, qty: 0.547645, avgCost: null },
    ]);
  });
  it("crypto: simboli e ISIN fittizi di Trade Republic", () => {
    const { positions } = parsePositions("XF000BTC0017 0,0002\neth 0,1 2000");
    expect(positions.map((p) => p.id)).toEqual(["BTC-EUR", "ETH-EUR"]);
  });
  it("tiene il nome e somma le righe dello stesso strumento con prezzo medio ponderato", () => {
    const { positions } = parsePositions("iShares Core MSCI World;IE00B4L5Y983;1;100\nIE00B4L5Y983;3;120");
    expect(positions).toHaveLength(1);
    expect(positions[0].name).toBe("iShares Core MSCI World");
    expect(positions[0].qty).toBe(4);
    expect(positions[0].avgCost).toBeCloseTo(115, 9);
  });
  it("prezzo medio noto solo per parte delle quote: nessun prezzo medio", () => {
    const { positions } = parsePositions("IE00B4L5Y983 1 100\nIE00B4L5Y983 1");
    expect(positions[0].avgCost).toBeNull();
  });
  it("salta righe senza ISIN o con quote a zero", () => {
    const { positions, skipped } = parsePositions("ciao 3\nIE00B4L5Y983 0");
    expect(positions).toEqual([]);
    expect(skipped).toHaveLength(2);
  });
});

import { describe, expect, it } from "vitest";
import { parseNumber } from "@/lib/parse";

describe("parseNumber", () => {
  it.each([
    ["1.234,56", 1234.56],
    ["2.064", 2064],
    ["1.234.567", 1234567],
    ["0,0002", 0.0002],
    ["1234.56", 1234.56],
    ["0.5", 0.5],
    ["0.315", 0.315], // zero iniziale: decimale, non migliaia
    ["-12,5", -12.5],
    ["  98,40 € ", 98.4],
    ["9,9%", 9.9],
  ])("%s → %d", (raw, n) => expect(parseNumber(raw)).toBe(n));

  it("vuoto è null, testo è NaN", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber(null)).toBeNull();
    expect(parseNumber("abc")).toBeNaN();
  });
});

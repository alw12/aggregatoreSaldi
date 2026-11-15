import { describe, expect, it } from "vitest";
import { categorize, spendingByCategory } from "@/lib/categories";
import type { Movement } from "@/lib/flows";

const mv = (date: string, amount: number, party: string, kind: Movement["kind"] = amount < 0 ? "out" : "in"): Movement => ({
  id: `${date}${party}${amount}`, date, amount, currency: "EUR", party, account: "Banca, Conto", kind,
});

describe("categorie di spesa", () => {
  it("riconosce le controparti più comuni", () => {
    const c = (party: string) => categorize({ party, amount: -10, currency: "EUR" });
    expect(c("ESSELUNGA SPA MILANO")).toBe("spesa");
    expect(c("PAGAMENTO POS LIDL 1234")).toBe("spesa");
    expect(c("Deliveroo Italy")).toBe("ristoranti");
    expect(c("BAR CENTRALE")).toBe("ristoranti");
    expect(c("ENI STATION 123")).toBe("trasporti");
    expect(c("New Gas Network Di Mando")).toBe("trasporti");
    expect(c("Unicoop Firenze Empoli")).toBe("spesa");
    expect(c("CANONE CONTO Relativo a Agosto 2026")).toBe("altro");
    expect(c("RATA FINANZIAMENTO COMPASS BANCA S.P.A.")).toBe("rate");
    expect(c("Metano Toscana - Empol")).toBe("trasporti");
    expect(c("PAGAMENTO POS TOSANO CALENZANO 12/09/2026")).toBe("spesa");
    expect(c("Crf Exp 3428")).toBe("spesa");
    expect(c("CAFE' VALENTINO")).toBe("ristoranti");
    expect(c("PAGAMENTO POS WWW.ALPSIM.IT 09/11/2026")).toBe("casa");
    expect(c("LEFTIES 17053")).toBe("shopping");
    expect(c("POSTAGIRO A guerrieri de anna TRN EA26110669689603PO per mese novembre")).toBe("casa");
    expect(c("PAGAMENTO POS BIM Firenze Gigli 03/10/2026")).toBe("ristoranti");
    expect(c("Buoni & Belli Srl")).toBe("salute");
    expect(c("Ne. Group Srl")).toBe("spesa");
    expect(c("Top Laundry S.r.l.")).toBe("casa");
    expect(c("Crivide Di Lelli Cristin")).toBe("salute");
    expect(c("TIGOTA' 123")).toBe("salute");
    expect(c("D303 Altopascio")).toBe("ristoranti");
    expect(c("Eni Plenitude SDD")).toBe("casa");
    expect(c("ILIAD ITALIA")).toBe("casa");
    expect(c("AMAZON PRIME")).toBe("abbonamenti");
    expect(c("AMZN Mktp IT")).toBe("shopping");
    expect(c("FARMACIA COMUNALE")).toBe("salute");
    expect(c("Bonifico a Mario Rossi")).toBe("altro");
  });
  it("la rata di un prestito si riconosce dall'importo", () => {
    expect(categorize({ party: "SDD CORE 8812", amount: -281.82, currency: "EUR" }, [281.82])).toBe("rate");
  });
  it("somma per categoria nel periodo, senza entrate, giroconti e soldi messi da parte; Altro in fondo", () => {
    const rows = spendingByCategory(
      [
        mv("2026-11-02", -50, "Esselunga"),
        mv("2026-11-03", -30, "Conad"),
        mv("2026-11-04", -281.82, "SDD 8812"),
        mv("2026-11-05", -500, "Bonifico Mario"),
        mv("2026-11-06", 1500, "Stipendio"),
        mv("2026-11-07", -200, "Revolut", "internal"),
        mv("2026-11-08", -300, "Scalable", "invest"),
        mv("2026-10-31", -99, "Esselunga"),
      ],
      "2026-11-01",
      "2026-11-31",
      [281.82],
    );
    expect(rows.map((r) => [r.key, r.total])).toEqual([["rate", 281.82], ["spesa", 80], ["altro", 500]]);
  });
});

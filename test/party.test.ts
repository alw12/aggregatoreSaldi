import { describe, expect, it } from "vitest";
import { displayParty, partyKey } from "@/lib/party";

describe("controparti", () => {
  it("nome leggibile: via data, operazione, carta e codici SEPA", () => {
    expect(displayParty("PAGAMENTO POS WWW.ALPSIM.IT 09/11/2026 09.04 MERANO Op.680229 carta ****2593")).toBe("Alpsim.it");
    expect(displayParty("DOMICILIAZIONE (ADDEBITO DIRETTO SEPA) FASTWEB SpA CID.IT830010000012878470157 M")).toBe("FASTWEB SpA");
    expect(displayParty("RATA FINANZIAMENTO COMPASS BANCA S.P.A. CID.IT050020000000864530159 MAN.MNDTCO00")).toBe("Rata Finanziamento Compass Banca S.p.a.");
    expect(displayParty("Netflix.com")).toBe("Netflix.com");
  });
  it("chiave stabile tra ordini, punti vendita e date diverse", () => {
    expect(partyKey("Amazon* B83ak5op4")).toBe(partyKey("Amazon* Nk1oh9mi4"));
    expect(partyKey("Mc Donald S 14")).toBe(partyKey("Mc Donald S 2"));
    expect(partyKey("Mc Donald S 14")).toBe("mc donald");
    expect(partyKey("Eni Pv - 04836")).toBe("eni pv");
    expect(partyKey("PAGAMENTO POS WWW.ALPSIM.IT 09/11/2026 09.04 MERANO Op.680229 carta ****2593")).toBe("alpsim it");
    expect(partyKey("Ai Banchi Srl")).toBe("ai banchi");
  });
});

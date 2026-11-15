import { describe, expect, it } from "vitest";
import type { Movement } from "@/lib/flows";
import { findOddities } from "@/lib/anomalies";

let n = 0;
const mv = (date: string, amount: number, party: string, account = "Revolut, Conto"): Movement => ({ id: String(n++), date, amount, currency: "EUR", party, account, kind: amount >= 0 ? "in" : "out" });
const kinds = (moves: Movement[], today = "2026-11-15") => findOddities(moves, today).map((o) => o.kind);

const base = [mv("2026-08-18", -20, "Conad")];

describe("cose strane", () => {
  it("addebito doppio: stesso conto e importo a pochi giorni, sopra 10 €", () => {
    expect(kinds([...base, mv("2026-11-13", -59.9, "Zalando"), mv("2026-11-14", -59.9, "Zalando")])).toEqual(["doppio"]);
    expect(kinds([...base, mv("2026-11-13", -3, "Bar"), mv("2026-11-13", -3, "Bar")])).toEqual([]);
    expect(kinds([...base, mv("2026-11-13", -59.9, "Zalando", "A"), mv("2026-11-14", -59.9, "Zalando", "B")])).toEqual([]);
  });
  it("spesa insolita: molto più del solito con la stessa controparte", () => {
    const usual = ["2026-09-05", "2026-09-20", "2026-10-05", "2026-10-20"].map((d) => mv(d, -40, "Eni 04836"));
    expect(kinds([...base, ...usual, mv("2026-11-12", -150, "Eni 04836")])).toEqual(["insolita"]);
    expect(kinds([...base, ...usual, mv("2026-11-12", -60, "Eni 04836")])).toEqual([]);
    // La spesa grossa al supermercato: oltre 2,5 volte ma meno di 50 € in più
    const coop = ["2026-09-05", "2026-09-20", "2026-10-05"].map((d) => mv(d, -10, "Unicoop Empoli"));
    expect(kinds([...base, ...coop, mv("2026-11-12", -45, "Unicoop Empoli")])).toEqual([]);
  });
  it("spesa grande verso qualcuno mai pagato prima", () => {
    expect(kinds([...base, mv("2026-11-12", -480, "Mediaworld Firenze")])).toEqual(["nuova"]);
    // Stesso destinatario scritto in un altro modo: non è nuovo
    expect(kinds([...base, mv("2026-10-09", -330, "POSTAGIRO A guerrieri deanna TRN EA26"), mv("2026-11-06", -549.04, "POSTAGIRO A guerrieri de anna TRN EA26")])).toEqual([]);
  });
  it("aumento di un abbonamento", () => {
    const sub = [mv("2026-09-08", -17.99, "Netflix.com"), mv("2026-10-08", -17.99, "Netflix.com"), mv("2026-11-08", -19.99, "Netflix.com")];
    const odd = findOddities([...base, ...sub], "2026-11-10");
    expect(odd.map((o) => o.kind)).toEqual(["aumento"]);
    expect(odd[0].text.replace(/ /g, " ")).toBe("Netflix.com è passato da 17,99 € a 19,99 € al mese.");
  });
  it("nuova spesa ricorrente solo se prima dei mesi letti non c'era", () => {
    const gym = [mv("2026-10-12", -29.9, "Palestra Fit"), mv("2026-11-12", -29.9, "Palestra Fit")];
    expect(kinds([...base, ...gym])).toEqual(["ricorrente"]);
    // Partita subito dopo l'inizio dei dati: poteva esserci già prima
    expect(kinds([mv("2026-09-25", -5, "Conad"), mv("2026-10-01", -29.9, "Palestra Fit"), mv("2026-11-01", -29.9, "Palestra Fit")], "2026-11-03")).toEqual([]);
  });
  it("le cose vecchie di una settimana non si segnalano più", () => {
    expect(kinds([...base, mv("2026-11-01", -59.9, "Zalando"), mv("2026-11-02", -59.9, "Zalando")])).toEqual([]);
  });
});

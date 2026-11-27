import { describe, expect, it } from "vitest";
import { bankSupport, describeStatus, formatIban, isValidIban, parseTransfer, paymentBody, pickPaymentType, sepaText } from "@/lib/payments";
import { recentBeneficiaries, type StoredPayment } from "@/lib/payment-store";

const base = { fromUid: "acc-1", name: "Mario Rossi", iban: "IT60 X054 2811 1010 0000 0123 456", amount: "1.250,50", reference: "Affitto dicembre", instant: false };

describe("IBAN", () => {
  it("cifre di controllo e lunghezza italiana", () => {
    expect(isValidIban("IT60X0542811101000000123456")).toBe(true);
    expect(isValidIban("it60 x054 2811 1010 0000 0123 456")).toBe(true);
    expect(isValidIban("IT61X0542811101000000123456")).toBe(false);
    expect(isValidIban("IT60X054281110100000012345")).toBe(false);
    expect(isValidIban("DE89370400440532013000")).toBe(true);
    expect(isValidIban("non un iban")).toBe(false);
  });
  it("a gruppi di quattro", () => {
    expect(formatIban("it60x0542811101000000123456")).toBe("IT60 X054 2811 1010 0000 0123 456");
  });
});

describe("testo SEPA", () => {
  it("toglie accenti e caratteri non ammessi, taglia alla lunghezza", () => {
    expect(sepaText("Caffè & più – n° 3", 140)).toBe("Caffe piu n 3");
    expect(sepaText("  Niccolò   D'Amico  ", 70)).toBe("Niccolo D'Amico");
    expect(sepaText("a".repeat(200), 140)).toHaveLength(140);
  });
});

describe("modulo del bonifico", () => {
  it("dati validi: importo all'italiana, IBAN normalizzato", () => {
    const r = parseTransfer(base, "IT42L1234512345123456789012");
    expect(r).toEqual({ ok: true, draft: { fromUid: "acc-1", name: "Mario Rossi", iban: "IT60X0542811101000000123456", amount: 1250.5, reference: "Affitto dicembre", instant: false } });
  });
  it("errori leggibili", () => {
    const err = (over: Partial<typeof base>, from?: string) => {
      const r = parseTransfer({ ...base, ...over }, from);
      return r.ok ? null : r.error;
    };
    expect(err({ fromUid: "" })).toMatch(/conto/);
    expect(err({ name: "  " })).toMatch(/beneficiario/);
    expect(err({ iban: "IT61X0542811101000000123456" })).toMatch(/IBAN/);
    expect(err({}, "IT60X0542811101000000123456")).toMatch(/stesso/);
    expect(err({ amount: "0" })).toMatch(/maggiore/);
    expect(err({ amount: "-5" })).toMatch(/maggiore/);
    expect(err({ amount: "10,005" })).toMatch(/due decimali/);
    expect(err({ amount: "abc" })).toMatch(/Importo/);
    expect(err({ reference: "€€" })).toMatch(/causale/);
  });
});

describe("richiesta a Enable Banking", () => {
  it("SEPA o istantaneo, importo con il punto, IBAN come GenericIdentification", () => {
    const r = parseTransfer({ ...base, amount: "20", instant: true });
    if (!r.ok) throw new Error(r.error);
    const body = paymentBody({ draft: r.draft, paymentType: "INST_SEPA", fromIban: "IT42 L123 4512 3451 2345 6789 012", currency: "EUR", aspsp: { name: "Banca X", country: "IT" }, state: "s1", redirectUrl: "https://x/api/eb/callback" });
    expect(body.payment_type).toBe("INST_SEPA");
    expect(body.payment_request.debtor_account).toEqual({ identification: "IT42L1234512345123456789012", scheme_name: "IBAN" });
    expect(body.payment_request.credit_transfer_transaction[0]).toEqual({
      instructed_amount: { amount: "20.00", currency: "EUR" },
      beneficiary: { creditor: { name: "Mario Rossi" }, creditor_account: { identification: "IT60X0542811101000000123456", scheme_name: "IBAN" } },
      remittance_information: ["Affitto dicembre"],
    });
    expect(body).toMatchObject({ state: "s1", psu_type: "personal", aspsp: { name: "Banca X", country: "IT" } });
  });
});

describe("stati", () => {
  it("etichette e stato definitivo dalla banca", () => {
    expect(describeStatus("ACSC")).toMatchObject({ tone: "ok", final: true });
    expect(describeStatus("RJCT").tone).toBe("ko");
    expect(describeStatus("RCVD").final).toBe(false);
    expect(describeStatus("ACSP", true).final).toBe(true);
    expect(describeStatus("XXXX").label).toBe("Stato XXXX");
  });
});

describe("beneficiari già pagati", () => {
  const p = (iban: string, name: string, status: string, createdAt: string) => ({ iban, name, status, createdAt }) as StoredPayment;
  it("il più recente per IBAN, senza bozze né rifiutati", () => {
    const list = [
      p("IT1", "Affitto Srl", "ACSC", "2026-11-20"),
      p("IT2", "Bozza", "draft", "2026-11-19"),
      p("IT3", "Rifiutato", "RJCT", "2026-11-18"),
      p("IT1", "Nome vecchio", "ACSC", "2026-10-01"),
      p("IT4", "Luca", "ACSP", "2026-09-01"),
    ];
    expect(recentBeneficiaries(list)).toEqual([{ name: "Affitto Srl", iban: "IT1" }, { name: "Luca", iban: "IT4" }]);
  });
});

describe("tipo di bonifico", () => {
  it("istantaneo solo se c'è INST_SEPA; ordinario SEPA, altrimenti nazionale", () => {
    expect(pickPaymentType(["SEPA", "INST_SEPA"], true)).toBe("INST_SEPA");
    expect(pickPaymentType(["SEPA"], true)).toBeNull();
    expect(pickPaymentType(["DOMESTIC", "SEPA"], false)).toBe("SEPA");
    expect(pickPaymentType(["DOMESTIC"], false)).toBe("DOMESTIC");
    expect(pickPaymentType(["CROSSBORDER"], false)).toBeNull();
    expect(pickPaymentType(undefined, false)).toBe("SEPA");
  });
});

describe("banche e bonifici", () => {
  const coverage = {
    IT: { aspsps: [{ name: "BBVA", types: ["SEPA", "INST_SEPA"] }, { name: "Poste Italiane", types: ["DOMESTIC"] }, { name: "Banca Muta" }, { name: "Solo Estero", types: ["CROSSBORDER"] }] },
    LT: { error: "L'applicazione Enable Banking non può avviare bonifici (403)" },
  };
  it("dall'elenco del paese, per nome", () => {
    expect(bankSupport({ name: "BBVA", country: "IT" }, coverage)).toEqual({ kind: "ok", ordinary: true, instant: true });
    expect(bankSupport({ name: "Poste Italiane", country: "IT" }, coverage)).toEqual({ kind: "ok", ordinary: true, instant: false });
    expect(bankSupport({ name: "Banca Muta", country: "IT" }, coverage)).toEqual({ kind: "ok", ordinary: true, instant: null });
    expect(bankSupport({ name: "Solo Estero", country: "IT" }, coverage)).toEqual({ kind: "none" });
    expect(bankSupport({ name: "Revolut", country: "IT" }, coverage)).toEqual({ kind: "none" });
    expect(bankSupport({ name: "Revolut", country: "LT" }, coverage)).toMatchObject({ kind: "unknown", error: expect.stringMatching(/403/) });
    expect(bankSupport({ name: "X", country: "FR" }, coverage).kind).toBe("unknown");
  });
});

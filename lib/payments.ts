import { parseNumber } from "./parse";

/** Bonifici: controlli e testi, senza rete né storage (così si possono testare). */

export function normalizeIban(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

/** Formato e cifre di controllo (ISO 13616, modulo 97). */
export function isValidIban(raw: string): boolean {
  const iban = normalizeIban(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  if (iban.startsWith("IT") && iban.length !== 27) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const ch of moved) {
    const digits = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest === 1;
}

export const formatIban = (iban: string) => normalizeIban(iban).replace(/(.{4})/g, "$1 ").trim();
export const maskIban = (iban?: string) => (iban ? `${iban.slice(0, 4)} •••• ${iban.slice(-4)}` : "");

/**
 * Testo accettato dal circuito SEPA: lettere senza accenti, cifre, spazi e / - ? : ( ) . , ' +.
 * Gli accenti diventano la lettera semplice, il resto uno spazio.
 */
export function sepaText(raw: string, max: number): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

export const MAX_NAME = 70;
export const MAX_REFERENCE = 140;

export type TransferDraft = {
  fromUid: string;
  name: string;
  iban: string;
  amount: number;
  reference: string;
  instant: boolean;
};

export type DraftResult = { ok: true; draft: TransferDraft } | { ok: false; error: string };

/** Controlla i dati del modulo e li porta nella forma che va alla banca. */
export function parseTransfer(form: {
  fromUid: string;
  name: string;
  iban: string;
  amount: FormDataEntryValue | null;
  reference: string;
  instant: boolean;
}, fromIban?: string): DraftResult {
  if (!form.fromUid) return { ok: false, error: "Scegli il conto da cui partire" };
  const name = sepaText(form.name, MAX_NAME);
  if (!name) return { ok: false, error: "Scrivi il nome del beneficiario" };
  const iban = normalizeIban(form.iban);
  if (!isValidIban(iban)) return { ok: false, error: "IBAN del beneficiario non valido: controlla le cifre" };
  if (fromIban && normalizeIban(fromIban) === iban) return { ok: false, error: "Il conto di arrivo è lo stesso di partenza" };
  const amount = parseNumber(form.amount);
  if (amount === null || Number.isNaN(amount)) return { ok: false, error: "Importo non valido" };
  if (amount <= 0) return { ok: false, error: "L'importo deve essere maggiore di zero" };
  if (Math.abs(Math.round(amount * 100) - amount * 100) > 1e-6) return { ok: false, error: "Importo con al massimo due decimali" };
  if (amount > 999_999_999) return { ok: false, error: "Importo troppo alto" };
  const reference = sepaText(form.reference, MAX_REFERENCE);
  if (!reference) return { ok: false, error: "Scrivi la causale" };
  return { ok: true, draft: { fromUid: form.fromUid, name, iban, amount: Math.round(amount * 100) / 100, reference, instant: form.instant } };
}

/** Importo come lo vuole l'API: stringa con due decimali e il punto. */
export const apiAmount = (n: number) => n.toFixed(2);

/**
 * Stati ISO 20022 del pagamento (enum PaymentStatus di Enable Banking). Se la banca dice che lo stato
 * è definitivo (final_status) non lo si richiede più; senza quell'informazione decide "final" qui.
 */
export type PaymentStatus = { label: string; tone: "ok" | "wait" | "ko"; final: boolean };

const STATUS: Record<string, PaymentStatus> = {
  ACCC: { label: "Accreditato al beneficiario", tone: "ok", final: true },
  ACSC: { label: "Addebitato e inviato", tone: "ok", final: true },
  ACSP: { label: "Accettato, in esecuzione", tone: "ok", final: false },
  ACPT: { label: "Accettato", tone: "ok", final: false },
  ACWC: { label: "Accettato con modifiche", tone: "ok", final: false },
  ACWP: { label: "Accettato, non ancora contabilizzato", tone: "wait", final: false },
  ACTC: { label: "Accettato, controlli superati", tone: "wait", final: false },
  ACCP: { label: "Accettato dalla banca", tone: "wait", final: false },
  RCVD: { label: "In attesa della conferma in banca", tone: "wait", final: false },
  PDNG: { label: "In attesa", tone: "wait", final: false },
  PART: { label: "Accettato in parte", tone: "wait", final: false },
  PDCR: { label: "Annullamento in corso", tone: "wait", final: false },
  RJCT: { label: "Rifiutato dalla banca", tone: "ko", final: true },
  CNCL: { label: "Annullato", tone: "ko", final: true },
  ACCR: { label: "Annullato su richiesta", tone: "ko", final: true },
  PACR: { label: "Annullato in parte", tone: "ko", final: true },
  RJCR: { label: "Annullamento rifiutato", tone: "wait", final: false },
};

export function describeStatus(code: string | undefined, finalFromBank?: boolean): PaymentStatus {
  const s = (code && STATUS[code]) || { label: code ? `Stato ${code}` : "In attesa della conferma in banca", tone: "wait" as const, final: false };
  return finalFromBank === undefined ? s : { ...s, final: finalFromBank };
}

/** Corpo di POST /payments per un bonifico singolo. */
export function paymentBody(p: {
  draft: TransferDraft;
  fromIban: string;
  currency: string;
  aspsp: { name: string; country: string };
  state: string;
  redirectUrl: string;
}) {
  return {
    payment_type: p.draft.instant ? "INST_SEPA" : "SEPA",
    payment_request: {
      debtor_account: { identification: normalizeIban(p.fromIban), scheme_name: "IBAN" },
      debtor_currency: p.currency,
      credit_transfer_transaction: [
        {
          instructed_amount: { amount: apiAmount(p.draft.amount), currency: p.currency },
          beneficiary: {
            creditor: { name: p.draft.name },
            creditor_account: { identification: p.draft.iban, scheme_name: "IBAN" },
          },
          remittance_information: [p.draft.reference],
        },
      ],
    },
    aspsp: p.aspsp,
    state: p.state,
    redirect_url: p.redirectUrl,
    psu_type: "personal",
    language: "it",
  };
}

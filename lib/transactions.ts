import "server-only";
import { EbError, getTransactions, type PsuHeaders, type Transaction } from "./eb";
import { listSessions, redis } from "./store";
import { classify, ownPattern, type Movement } from "./flows";

/** Movimenti di tutti i conti collegati, ultimi ~4 mesi, con cache di 6 ore (le banche limitano le letture). */

const TTL = 6 * 3600;
// Alcune banche (es. BancoPosta, BBVA) rifiutano con 422 un periodo più lungo di quanto concedono senza nuova SCA:
// si riprova con finestre più corte
const WINDOWS = [120, 89, 30];

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

async function fetchWithShorterWindows(uid: string, psu: PsuHeaders): Promise<Transaction[]> {
  let last: unknown;
  for (const days of WINDOWS) {
    try {
      return await getTransactions(uid, daysAgo(days), psu);
    } catch (e) {
      last = e;
      if (!(e instanceof EbError && e.status === 422)) throw e;
    }
  }
  throw last;
}

export type MovementsResult = { moves: Movement[]; errors: string[]; fetchedAt: string | null };

function partyOf(t: Transaction): string {
  const counter = t.credit_debit_indicator === "DBIT" ? t.creditor?.name : t.debtor?.name;
  const text = counter || t.remittance_information?.filter(Boolean).join(" ") || t.bank_transaction_code?.description || "Movimento";
  return text.replace(/\s+/g, " ").trim().slice(0, 80);
}

function describe(e: unknown): string {
  if (e instanceof EbError && e.status === 422) {
    // Il corpo spiega il motivo (es. periodo non consentito): lo mostriamo abbreviato
    const detail = e.body.match(/"(?:message|detail|error)"\s*:\s*"([^"]{1,140})/)?.[1];
    return `la banca non concede i movimenti${detail ? ` (${detail})` : ""}`;
  }
  if (e instanceof EbError) return e.status === 429 ? "limite di letture raggiunto, riprova più tardi" : e.status === 401 || e.status === 403 ? "consenso scaduto o senza accesso ai movimenti" : `errore ${e.status}`;
  return e instanceof Error ? e.message : String(e);
}

type Cached = { fetchedAt: string; moves: Movement[] };

/** `psu` vuoto = nessuna lettura dalla banca, solo cache (per non consumare il limite giornaliero). */
export async function loadMovements(psu: PsuHeaders | null): Promise<MovementsResult> {
  const r = redis();
  const sessions = (await listSessions()).filter((s) => new Date(s.validUntil).getTime() > Date.now());
  const ownIbans = new Set(sessions.flatMap((s) => s.accounts.map((a) => a.iban?.replace(/\s/g, "").toUpperCase())).filter((x): x is string => !!x));
  const bankNames = sessions.map((s) => s.aspsp.name);
  const labels = sessions.flatMap((s) => s.accounts.map((a) => a.label));
  const errors: string[] = [];
  const stamps: string[] = [];

  const lists = await Promise.all(
    sessions.flatMap((s) =>
      s.accounts.map(async (a): Promise<Movement[]> => {
        const key = `saldi:tx:${a.uid}`;
        const cached = r ? await r.get<Cached>(key) : null;
        const own = ownPattern(s.aspsp.name, bankNames, labels);
        // La classificazione si rifà a ogni lettura: cambia se colleghi o scolleghi una banca
        const reclassify = (moves: Movement[]) => moves.map((m) => ({ ...m, kind: classify(m.amount, m.party, m.counterIban ?? null, ownIbans, own) }));
        if (cached) {
          stamps.push(cached.fetchedAt);
          return reclassify(cached.moves);
        }
        if (!psu) return [];
        try {
          const txs = await fetchWithShorterWindows(a.uid, psu);
          const account = `${s.aspsp.name}, ${a.label}`;
          const moves = txs
            .filter((t) => t.status !== "RJCT")
            .map((t, i): Movement => {
              const amount = Number(t.transaction_amount.amount) * (t.credit_debit_indicator === "DBIT" ? -1 : 1);
              const counterIban = (t.credit_debit_indicator === "DBIT" ? t.creditor_account?.iban : t.debtor_account?.iban) ?? null;
              const party = partyOf(t);
              return {
                id: `${a.uid}:${t.entry_reference ?? t.transaction_id ?? i}`,
                date: t.booking_date ?? t.value_date ?? t.transaction_date ?? daysAgo(0),
                amount,
                currency: t.transaction_amount.currency,
                party,
                account,
                counterIban,
                kind: classify(amount, party, counterIban, ownIbans, own),
              };
            });
          const value: Cached = { fetchedAt: new Date().toISOString(), moves };
          if (r) await r.set(key, value, { ex: TTL });
          stamps.push(value.fetchedAt);
          return moves;
        } catch (e) {
          errors.push(`${s.aspsp.name} ${a.label}: ${describe(e)}`);
          return [];
        }
      }),
    ),
  );
  return { moves: lists.flat().sort((a, b) => b.date.localeCompare(a.date)), errors, fetchedAt: stamps.sort()[0] ?? null };
}

export async function clearMovementsCache(): Promise<void> {
  const r = redis();
  if (!r) return;
  const uids = (await listSessions()).flatMap((s) => s.accounts.map((a) => a.uid));
  if (uids.length) await r.del(...uids.map((u) => `saldi:tx:${u}`));
}

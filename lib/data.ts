import "server-only";
import { EbError, getBalances, pickBalance, type PsuHeaders } from "./eb";
import { getCachedBalances, listSessions, setCachedBalances, type StoredSession } from "./store";

export type AccountView = {
  uid: string;
  label: string;
  iban?: string;
  currency: string;
  amount: number | null;
  balanceType?: string;
  error?: string;
};

export type BankView = {
  sessionId: string;
  bank: string;
  country: string;
  validUntil: string;
  daysLeft: number;
  expired: boolean;
  fetchedAt: string | null;
  accounts: AccountView[];
};

const CACHE_SECONDS = Number(process.env.BALANCE_CACHE_MINUTES ?? 30) * 60;

function describeError(e: unknown): string {
  if (e instanceof EbError) {
    if (e.status === 401 || e.status === 403) return "Consenso scaduto o revocato: ricollega la banca";
    if (e.status === 429) return "Limite di letture raggiunto dalla banca, riprova più tardi";
    return `Errore ${e.status}`;
  }
  return e instanceof Error ? e.message : "Errore sconosciuto";
}

async function loadBank(s: StoredSession, psu: PsuHeaders): Promise<BankView> {
  const msLeft = new Date(s.validUntil).getTime() - Date.now();
  const base = {
    sessionId: s.sessionId,
    bank: s.aspsp.name,
    country: s.aspsp.country,
    validUntil: s.validUntil,
    daysLeft: Math.max(0, Math.floor(msLeft / 86_400_000)),
    expired: msLeft <= 0,
  };

  if (base.expired) {
    return {
      ...base,
      fetchedAt: null,
      accounts: s.accounts.map((a) => ({ ...a, amount: null, error: "Consenso scaduto: ricollega la banca" })),
    };
  }

  const cached = await getCachedBalances(s.sessionId);
  if (cached) {
    return { ...base, fetchedAt: cached.fetchedAt, accounts: cached.data.accounts as AccountView[] };
  }

  const accounts = await Promise.all(
    s.accounts.map(async (a): Promise<AccountView> => {
      try {
        const b = pickBalance(await getBalances(a.uid, psu));
        return {
          uid: a.uid,
          label: a.label,
          iban: a.iban,
          currency: b?.balance_amount.currency ?? a.currency,
          amount: b ? Number(b.balance_amount.amount) : null,
          balanceType: b?.balance_type,
          error: b ? undefined : "Nessun saldo restituito",
        };
      } catch (e) {
        return { uid: a.uid, label: a.label, iban: a.iban, currency: a.currency, amount: null, error: describeError(e) };
      }
    }),
  );

  const fetchedAt = new Date().toISOString();
  // Metti in cache solo se almeno un conto è andato a buon fine
  if (accounts.some((a) => a.amount !== null)) {
    await setCachedBalances(s.sessionId, { fetchedAt, data: { accounts } }, CACHE_SECONDS);
  }
  return { ...base, fetchedAt, accounts };
}

export async function loadDashboard(psu: PsuHeaders): Promise<BankView[]> {
  const sessions = await listSessions();
  return Promise.all(sessions.map((s) => loadBank(s, psu)));
}

/** Header PSU: segnalano alla banca che l'utente è presente, evitando il limite di 4 letture/giorno. */
export function psuHeadersFrom(h: Headers): PsuHeaders {
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "127.0.0.1";
  const headers: PsuHeaders = {
    "Psu-Ip-Address": ip,
    "Psu-User-Agent": h.get("user-agent") ?? "Mozilla/5.0",
    "Psu-Accept": h.get("accept") ?? "text/html",
    "Psu-Accept-Language": h.get("accept-language") ?? "it-IT",
    "Psu-Accept-Encoding": h.get("accept-encoding") ?? "gzip",
    "Psu-Accept-Charset": "utf-8",
    "Psu-Referer": h.get("referer") ?? "",
  };
  return Object.fromEntries(Object.entries(headers).filter(([, v]) => v));
}

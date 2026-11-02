import "server-only";
import { after } from "next/server";
import { EbError, getBalances, pickBalance, type PsuHeaders } from "./eb";
import {
  balanceRefreshRequestedAt,
  getCachedBalances,
  listSessions,
  lockBalanceRefresh,
  setCachedBalances,
  type CachedBalances,
  type StoredSession,
} from "./store";
import { listOverrides, type BalanceOverride } from "./manual";

export type AccountView = {
  uid: string;
  label: string;
  iban?: string;
  currency: string;
  amount: number | null;
  balanceType?: string;
  error?: string;
  manualAt?: string; // saldo inserito a mano che sostituisce quello della banca
  staleAt?: string; // la banca non ha risposto: è il saldo dell'ultima lettura riuscita
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
const FORCE_WINDOW_MS = 2 * 60_000;

function describeError(e: unknown): string {
  if (e instanceof EbError) {
    if (e.status === 401 || e.status === 403) return "Consenso scaduto o revocato: ricollega la banca";
    if (e.status === 429) return "Limite di letture raggiunto dalla banca, riprova più tardi";
    return `Errore ${e.status}`;
  }
  if (e instanceof Error && e.name === "TimeoutError") return "La banca non ha risposto in tempo";
  return e instanceof Error ? e.message : "Errore sconosciuto";
}

const isConsentError = (e: unknown) => e instanceof EbError && (e.status === 401 || e.status === 403);

/** Legge i saldi dalla banca; se un conto non risponde tiene il saldo dell'ultima lettura riuscita. */
async function readBank(s: StoredSession, psu: PsuHeaders, prev: CachedBalances | null) {
  const prevAccounts = (prev?.data.accounts ?? []) as AccountView[];
  let live = 0;
  const accounts = await Promise.all(
    s.accounts.map(async (a): Promise<AccountView> => {
      try {
        const b = pickBalance(await getBalances(a.uid, psu));
        if (b) live++;
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
        const old = prevAccounts.find((x) => x.uid === a.uid && x.amount !== null);
        if (old && prev && !isConsentError(e)) return { ...old, label: a.label, staleAt: old.staleAt ?? prev.fetchedAt };
        return { uid: a.uid, label: a.label, iban: a.iban, currency: a.currency, amount: null, error: describeError(e) };
      }
    }),
  );

  const fetchedAt = new Date().toISOString();
  // Salva solo se almeno un conto è stato letto davvero dalla banca
  if (live > 0) await setCachedBalances(s.sessionId, { fetchedAt, data: { accounts } });
  return { fetchedAt: live > 0 ? fetchedAt : (prev?.fetchedAt ?? null), accounts };
}

export type LoadOptions = {
  /** true = aspetta sempre la banca se la lettura è vecchia (es. job giornaliero); altrimenti la rilegge in background. */
  live?: boolean;
};

async function loadBank(s: StoredSession, psu: PsuHeaders, refreshAt: string | null, opts: LoadOptions): Promise<BankView> {
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
  // "Aggiorna" appena premuto: aspetta la banca. Se la banca non risponde, dopo un paio di minuti
  // si torna a mostrare subito l'ultima lettura, invece di riaspettarla a ogni apertura
  const forced =
    !!cached && !!refreshAt && refreshAt > cached.fetchedAt && Date.now() - new Date(refreshAt).getTime() < FORCE_WINDOW_MS;
  if (cached && !forced) {
    const old = Date.now() - new Date(cached.fetchedAt).getTime() > CACHE_SECONDS * 1000;
    if (!old) return { ...base, fetchedAt: cached.fetchedAt, accounts: cached.data.accounts as AccountView[] };
    if (!opts.live) {
      // Mostra subito l'ultima lettura: la prossima apertura avrà quella nuova
      after(async () => {
        if (await lockBalanceRefresh(s.sessionId)) await readBank(s, psu, cached).catch(() => undefined);
      });
      return { ...base, fetchedAt: cached.fetchedAt, accounts: cached.data.accounts as AccountView[] };
    }
  }

  return { ...base, ...(await readBank(s, psu, cached)) };
}

function applyOverride(a: AccountView, o: BalanceOverride | undefined): AccountView {
  return o ? { ...a, amount: o.amount, error: undefined, manualAt: o.updatedAt } : a;
}

export async function loadDashboard(psu: PsuHeaders, opts: LoadOptions = {}): Promise<BankView[]> {
  const [sessions, overrides, refreshAt] = await Promise.all([listSessions(), listOverrides(), balanceRefreshRequestedAt()]);
  const banks = await Promise.all(sessions.map((s) => loadBank(s, psu, refreshAt, opts)));
  // Gli override si applicano dopo la cache, così modificarli ha effetto subito
  return banks.map((b) => ({ ...b, accounts: b.accounts.map((a) => applyOverride(a, overrides[a.uid])) }));
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

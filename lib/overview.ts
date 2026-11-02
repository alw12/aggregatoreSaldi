import "server-only";
import { loadDashboard, type BankView, type LoadOptions } from "./data";
import type { PsuHeaders } from "./eb";
import { loadPortfolio, type HoldingView } from "./portfolio";
import { loadBonds, type BondView } from "./bonds";
import { loadCards, type CreditCardView } from "./cards";
import { listManualAccounts, type ManualAccount } from "./manual";
import { listDebts, type Debt } from "./debts";
import { listPossessions, type Possession } from "./beni";
import { loadHistory, todayRome, type Snapshot } from "./history";

/** Tutti i dati dell'app in una volta, con gli stessi totali della Panoramica. */
export type Overview = {
  banks: BankView[];
  manual: ManualAccount[];
  holdings: HoldingView[];
  portfolioError: string | null;
  bonds: BondView[];
  cards: CreditCardView[];
  debts: Debt[];
  beni: Possession[];
  history: Snapshot[];
  failed: number; // conti non letti, esclusi dai totali
  accountsCount: number;
  oldestFetch: string | null; // lettura più vecchia tra le banche collegate
  otherCurrencies: [string, number][]; // saldi non in EUR, fuori dal totale
  isEmpty: boolean;
  /** Fotografia di oggi; null se qualcosa non è stato letto, per non registrare buchi nello storico. */
  today: Omit<Snapshot, "date"> | null;
  /** Storico con la fotografia di oggi già al suo posto. */
  days: Snapshot[];
  totals: {
    cash: number; // solo EUR
    holdings: number;
    holdingsCost: number | null; // solo posizioni con prezzo di carico
    holdingsGain: number | null;
    bonds: number;
    invested: number;
    beni: number;
    cards: number;
    debts: number;
    net: number; // come in Panoramica: liquidità + investito − carte − debiti
    netWithBeni: number;
  };
};

export async function loadOverview(psu: PsuHeaders, opts: LoadOptions = {}): Promise<Overview> {
  const [banks, portfolio, bonds, cards, manual, history, debts, beni] = await Promise.all([
    loadDashboard(psu, opts),
    loadPortfolio().then(
      (holdings) => ({ holdings, error: null }),
      (e: unknown) => ({ holdings: [] as HoldingView[], error: e instanceof Error ? e.message : String(e) }),
    ),
    loadBonds(),
    loadCards(),
    listManualAccounts(),
    loadHistory().catch(() => [] as Snapshot[]),
    listDebts(),
    listPossessions(),
  ]);

  const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
  const eurAccounts = banks.flatMap((b) => b.accounts).filter((a) => a.currency === "EUR" && a.amount !== null);
  const cash = sum(eurAccounts, (a) => a.amount ?? 0) + sum(manual.filter((a) => a.currency === "EUR"), (a) => a.amount);
  const holdings = sum(portfolio.holdings, (h) => h.value ?? 0);
  const withCost = portfolio.holdings.filter((h) => h.gain !== null);
  const bondsValue = sum(bonds, (b) => b.value);
  const beniValue = sum(beni, (p) => p.value);
  const cardsDebt = sum(cards, (c) => c.balance);
  const debtsTotal = sum(debts, (d) => d.amount);
  const invested = holdings + bondsValue;
  const net = cash + invested - cardsDebt - debtsTotal;

  const other = new Map<string, number>();
  for (const a of banks.flatMap((b) => b.accounts)) if (a.amount !== null && a.currency !== "EUR") other.set(a.currency, (other.get(a.currency) ?? 0) + a.amount);
  for (const a of manual) if (a.currency !== "EUR") other.set(a.currency, (other.get(a.currency) ?? 0) + a.amount);
  const failed = banks.reduce((n, b) => n + b.accounts.filter((a) => a.amount === null).length, 0);
  const isEmpty =
    banks.length === 0 && portfolio.holdings.length === 0 && bonds.length === 0 && cards.length === 0 && manual.length === 0 && debts.length === 0;
  const complete = !isEmpty && failed === 0 && !portfolio.error && portfolio.holdings.every((h) => h.value !== null);
  const today = complete ? { total: net, cash, invested, cards: cardsDebt, debts: debtsTotal } : null;
  const date = todayRome();
  const days = [
    ...history.filter((s) => s.date !== date),
    ...(today ? [{ date, ...today }] : history.filter((s) => s.date === date)),
  ];

  return {
    banks,
    manual,
    holdings: portfolio.holdings,
    portfolioError: portfolio.error,
    bonds,
    cards,
    debts,
    beni,
    history,
    failed,
    accountsCount: banks.reduce((n, b) => n + b.accounts.length, 0) + manual.length,
    oldestFetch: banks.map((b) => b.fetchedAt).filter((x): x is string => !!x).sort()[0] ?? null,
    otherCurrencies: [...other.entries()].sort(([a], [b]) => a.localeCompare(b)),
    isEmpty,
    today,
    days,
    totals: {
      cash,
      holdings,
      holdingsCost: withCost.length ? sum(withCost, (h) => h.cost ?? 0) : null,
      holdingsGain: withCost.length ? sum(withCost, (h) => h.gain ?? 0) : null,
      bonds: bondsValue,
      invested,
      beni: beniValue,
      cards: cardsDebt,
      debts: debtsTotal,
      net,
      netWithBeni: net + beniValue,
    },
  };
}

/** Variazione del patrimonio netto rispetto a `n` giorni fa (l'ultima fotografia entro quella data). */
export function changeSince(days: Snapshot[], n: number): { delta: number; from: string } | null {
  const last = days.at(-1);
  if (!last) return null;
  const limit = new Date(`${last.date}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() - n);
  const iso = limit.toISOString().slice(0, 10);
  const base = days.filter((s) => s.date <= iso).at(-1);
  return base ? { delta: last.total - base.total, from: base.date } : null;
}

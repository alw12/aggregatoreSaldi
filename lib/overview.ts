import "server-only";
import { loadDashboard, type BankView } from "./data";
import type { PsuHeaders } from "./eb";
import { loadPortfolio, type HoldingView } from "./portfolio";
import { loadBonds, type BondView } from "./bonds";
import { loadCards, type CreditCardView } from "./cards";
import { listManualAccounts, type ManualAccount } from "./manual";
import { listDebts, type Debt } from "./debts";
import { listPossessions, type Possession } from "./beni";
import { loadHistory, type Snapshot } from "./history";

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

export async function loadOverview(psu: PsuHeaders): Promise<Overview> {
  const [banks, portfolio, bonds, cards, manual, history, debts, beni] = await Promise.all([
    loadDashboard(psu),
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
    failed: banks.reduce((n, b) => n + b.accounts.filter((a) => a.amount === null).length, 0),
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

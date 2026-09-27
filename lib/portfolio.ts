import "server-only";
import { redis } from "./store";

/** Una posizione del portafoglio (es. un ETF su Trade Republic). */
export type Holding = {
  id: string; // ISIN o simbolo inserito dall'utente, in maiuscolo
  symbol: string | null; // simbolo Yahoo Finance risolto (es. SPYI.DE)
  name: string;
  qty: number;
  manualPrice: number | null; // prezzo di riserva in EUR se Yahoo non risponde
  updatedAt: string;
};

export type HoldingView = Holding & {
  price: number | null; // EUR
  value: number | null; // EUR
  priceSource: "live" | "manuale" | null;
  priceTime: string | null;
  error?: string;
};

const KEY = "saldi:portfolio";
const PRICE_TTL = 15 * 60;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36";
const YAHOO = process.env.YAHOO_BASE_URL ?? "https://query1.finance.yahoo.com";
const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

// Borse preferite per ETF europei quotati in EUR
const SUFFIX_PREF = [".DE", ".MI", ".AS", ".PA", ".F", ".SG", ".MU", ".DU", ".BE", ".HM", ".VI"];

export async function listHoldings(): Promise<Holding[]> {
  const r = redis();
  if (!r) return [];
  const data = await r.hgetall<Record<string, Holding>>(KEY);
  return Object.values(data ?? {}).sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveHolding(h: Holding): Promise<void> {
  const r = redis();
  if (!r) throw new Error("Storage non configurato");
  await r.hset(KEY, { [h.id]: h });
}

export async function removeHolding(id: string): Promise<void> {
  const r = redis();
  if (!r) return;
  await r.hdel(KEY, id);
}

export async function getHolding(id: string): Promise<Holding | null> {
  const r = redis();
  if (!r) return null;
  return (await r.hget<Holding>(KEY, id)) ?? null;
}

async function yahoo<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  return (await res.json()) as T;
}

type SearchQuote = { symbol: string; shortname?: string; longname?: string; quoteType?: string };

/** Risolve un ISIN (o un simbolo) in simbolo Yahoo + nome. */
export async function resolveSymbol(input: string): Promise<{ symbol: string; name: string }> {
  const q = input.trim().toUpperCase();
  if (!ISIN_RE.test(q)) {
    // Già un simbolo (es. BTC-EUR, SPYI.DE): verifica che esista
    const quote = await fetchQuote(q);
    return { symbol: q, name: quote.name ?? q };
  }
  const data = await yahoo<{ quotes?: SearchQuote[] }>(
    `${YAHOO}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`,
  );
  const quotes = (data.quotes ?? []).filter((x) => x.symbol);
  if (!quotes.length) throw new Error(`Nessun titolo trovato per ${q}`);
  const rank = (s: string) => {
    const i = SUFFIX_PREF.findIndex((suf) => s.endsWith(suf));
    return i === -1 ? 99 : i;
  };
  quotes.sort((a, b) => rank(a.symbol) - rank(b.symbol));
  const best = quotes[0];
  return { symbol: best.symbol, name: best.longname || best.shortname || q };
}

type ChartMeta = {
  currency?: string;
  regularMarketPrice?: number;
  regularMarketTime?: number;
  longName?: string;
  shortName?: string;
};

async function fetchQuote(symbol: string): Promise<{ price: number; currency: string; time: string; name?: string }> {
  const data = await yahoo<{ chart?: { result?: { meta: ChartMeta }[] } }>(
    `${YAHOO}/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`,
  );
  const meta = data.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice) throw new Error(`Prezzo non disponibile per ${symbol}`);
  let price = meta.regularMarketPrice;
  let currency = meta.currency ?? "EUR";
  // Alcune borse quotano in centesimi (GBp)
  if (currency === "GBp" || currency === "GBX") {
    price /= 100;
    currency = "GBP";
  }
  return {
    price,
    currency,
    time: new Date((meta.regularMarketTime ?? Date.now() / 1000) * 1000).toISOString(),
    name: meta.longName || meta.shortName,
  };
}

/** Prezzo in EUR con cache Redis di 15 minuti; converte le altre valute con il cambio Yahoo. */
async function priceEur(symbol: string): Promise<{ price: number; time: string }> {
  const r = redis();
  const key = `saldi:px:${symbol}`;
  const cached = r ? await r.get<{ price: number; time: string }>(key) : null;
  if (cached) return cached;

  const q = await fetchQuote(symbol);
  let price = q.price;
  if (q.currency !== "EUR") {
    const fx = await fetchQuote(`${q.currency}EUR=X`);
    price *= fx.price;
  }
  const value = { price, time: q.time };
  if (r) await r.set(key, value, { ex: PRICE_TTL });
  return value;
}

export async function clearPriceCache(): Promise<void> {
  const r = redis();
  if (!r) return;
  const holdings = await listHoldings();
  const keys = holdings.filter((h) => h.symbol).map((h) => `saldi:px:${h.symbol}`);
  if (keys.length) await r.del(...keys);
}

export async function loadPortfolio(): Promise<HoldingView[]> {
  const holdings = await listHoldings();
  return Promise.all(
    holdings.map(async (h): Promise<HoldingView> => {
      if (h.symbol) {
        try {
          const { price, time } = await priceEur(h.symbol);
          return { ...h, price, value: price * h.qty, priceSource: "live", priceTime: time };
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e);
          if (h.manualPrice !== null) {
            return { ...h, price: h.manualPrice, value: h.manualPrice * h.qty, priceSource: "manuale", priceTime: h.updatedAt, error };
          }
          return { ...h, price: null, value: null, priceSource: null, priceTime: null, error };
        }
      }
      if (h.manualPrice !== null) {
        return { ...h, price: h.manualPrice, value: h.manualPrice * h.qty, priceSource: "manuale", priceTime: h.updatedAt };
      }
      return { ...h, price: null, value: null, priceSource: null, priceTime: null, error: "Nessun prezzo disponibile" };
    }),
  );
}

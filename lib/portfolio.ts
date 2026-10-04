import "server-only";
import { redis } from "./store";

/** Una posizione del portafoglio (es. un ETF su Trade Republic). */
export type Holding = {
  id: string; // ISIN o simbolo inserito dall'utente, in maiuscolo
  symbol: string | null; // simbolo Yahoo Finance risolto (es. SPYI.DE); null = prezzo da justETF/CoinGecko
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

const JUSTETF = "https://www.justetf.com";
const COINGECKO = "https://api.coingecko.com/api/v3";

/** Crypto supportate da CoinGecko come riserva, per simbolo inserito dall'utente. */
const CRYPTO: Record<string, { id: string; name: string }> = {
  "BTC-EUR": { id: "bitcoin", name: "Bitcoin" },
  "ETH-EUR": { id: "ethereum", name: "Ethereum" },
  "SOL-EUR": { id: "solana", name: "Solana" },
  "XRP-EUR": { id: "ripple", name: "XRP" },
  "ADA-EUR": { id: "cardano", name: "Cardano" },
};
const cryptoFor = (id: string) => CRYPTO[id] ?? CRYPTO[`${id}-EUR`];

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

/**
 * Risolve un ISIN o un simbolo: prima su Yahoo, poi (se Yahoo non risponde, es. 429)
 * su justETF per gli ISIN e CoinGecko per le crypto. symbol null = prezzo dalla riserva.
 */
export async function resolveSymbol(input: string): Promise<{ symbol: string | null; name: string }> {
  const q = input.trim().toUpperCase();
  try {
    return await resolveYahoo(q);
  } catch (e) {
    const coin = cryptoFor(q);
    if (coin) {
      await coinGeckoPrice(coin.id);
      return { symbol: null, name: coin.name };
    }
    if (ISIN_RE.test(q)) {
      await justEtfPrice(q);
      return { symbol: null, name: (await justEtfName(q)) ?? q };
    }
    throw e;
  }
}

async function resolveYahoo(q: string): Promise<{ symbol: string; name: string }> {
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

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`${new URL(url).hostname} ${res.status}`);
  return (await res.json()) as T;
}

/** Ultimo prezzo in EUR di un ETF/ETC da justETF, per ISIN. */
async function justEtfPrice(isin: string): Promise<{ price: number; time: string }> {
  const d = await json<{ latestQuote?: { raw?: number }; latestQuoteDate?: string }>(
    `${JUSTETF}/api/etfs/${isin}/quote?locale=it&currency=EUR&isin=${isin}`,
  );
  if (!d.latestQuote?.raw) throw new Error(`Prezzo non disponibile per ${isin}`);
  return { price: d.latestQuote.raw, time: new Date(d.latestQuoteDate ?? Date.now()).toISOString() };
}

/** Nome dello strumento dal titolo della pagina justETF ("Nome | TICKER | ISIN"). */
async function justEtfName(isin: string): Promise<string | null> {
  try {
    const res = await fetch(`${JUSTETF}/it/etf-profile.html?isin=${isin}`, { headers: { "User-Agent": UA }, cache: "no-store" });
    const title = (await res.text()).match(/<title>([^<|]+)/i)?.[1]?.trim();
    return title ? title.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"') : null;
  } catch {
    return null;
  }
}

async function coinGeckoPrice(id: string): Promise<{ price: number; time: string }> {
  const d = await json<Record<string, { eur?: number }>>(`${COINGECKO}/simple/price?ids=${id}&vs_currencies=eur`);
  const price = d[id]?.eur;
  if (!price) throw new Error(`Prezzo non disponibile per ${id}`);
  return { price, time: new Date().toISOString() };
}

/** Prezzo dalla fonte di riserva (justETF per ISIN, CoinGecko per crypto), con la stessa cache di 15 minuti. */
async function fallbackPriceEur(id: string): Promise<{ price: number; time: string }> {
  const r = redis();
  const key = `saldi:px:${id}`;
  const cached = r ? await r.get<{ price: number; time: string }>(key) : null;
  if (cached) return cached;

  const coin = cryptoFor(id);
  let value: { price: number; time: string };
  if (coin) value = await coinGeckoPrice(coin.id);
  else if (ISIN_RE.test(id)) value = await justEtfPrice(id);
  else throw new Error(`Nessuna fonte di riserva per ${id}`);
  if (r) await r.set(key, value, { ex: PRICE_TTL });
  return value;
}

/** Yahoo se c'è un simbolo, altrimenti (o se Yahoo fallisce) la fonte di riserva. */
async function livePrice(h: Holding): Promise<{ price: number; time: string }> {
  if (h.symbol) {
    try {
      return await priceEur(h.symbol);
    } catch (e) {
      if (!cryptoFor(h.id) && !ISIN_RE.test(h.id)) throw e;
    }
  }
  return fallbackPriceEur(h.id);
}

export async function clearPriceCache(): Promise<void> {
  const r = redis();
  if (!r) return;
  const holdings = await listHoldings();
  const keys = holdings.flatMap((h) => [h.symbol && `saldi:px:${h.symbol}`, `saldi:px:${h.id}`]).filter((k): k is string => !!k);
  if (keys.length) await r.del(...keys);
}

export async function loadPortfolio(): Promise<HoldingView[]> {
  const holdings = await listHoldings();
  return Promise.all(
    holdings.map(async (h): Promise<HoldingView> => {
      try {
        const { price, time } = await livePrice(h);
        return { ...h, price, value: price * h.qty, priceSource: "live", priceTime: time };
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        if (h.manualPrice !== null) {
          return { ...h, price: h.manualPrice, value: h.manualPrice * h.qty, priceSource: "manuale", priceTime: h.updatedAt, error };
        }
        return { ...h, price: null, value: null, priceSource: null, priceTime: null, error };
      }
    }),
  );
}

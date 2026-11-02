import "server-only";
import { redis } from "./store";

export const BROKERS = ["Trade Republic", "Scalable Capital"] as const;
export type Broker = (typeof BROKERS)[number];
export const DEFAULT_BROKER: Broker = "Trade Republic";
export const isBroker = (v: unknown): v is Broker => BROKERS.includes(v as Broker);

export const ASSET_CLASSES = {
  azioni: "Azioni",
  obbligazioni: "Obbligazioni",
  oro: "Oro",
  materie: "Materie prime",
  crypto: "Crypto",
  altro: "Altro",
} as const;
export type AssetClass = keyof typeof ASSET_CLASSES;
export const isAssetClass = (v: unknown): v is AssetClass => typeof v === "string" && v in ASSET_CLASSES;

/** Una posizione del portafoglio (es. un ETF su Trade Republic). */
export type Holding = {
  id: string; // ISIN o simbolo inserito dall'utente, in maiuscolo
  broker: Broker; // assente nelle posizioni salvate prima di Scalable = Trade Republic
  symbol: string | null; // simbolo Yahoo Finance risolto (es. SPYI.DE); null = prezzo da justETF/CoinGecko
  name: string;
  qty: number;
  manualPrice: number | null; // prezzo di riserva in EUR se Yahoo non risponde
  avgCost?: number | null; // prezzo medio di carico in EUR per quota; assente nelle posizioni più vecchie
  assetClass?: AssetClass | null; // null = dedotto dal nome
  updatedAt: string;
};

export type HoldingView = Holding & {
  price: number | null; // EUR
  value: number | null; // EUR
  priceSource: "live" | "manuale" | null;
  priceTime: string | null;
  cls: AssetClass; // tipo effettivo: quello scelto o quello dedotto
  cost: number | null; // EUR investiti (prezzo medio × quote)
  gain: number | null; // EUR, valore − costo
  error?: string;
};

const KEY = "saldi:portfolio";
const PRICE_TTL = 15 * 60;
// Una fonte di prezzi lenta non deve bloccare la pagina: si passa alla riserva o al prezzo manuale
const PRICE_TIMEOUT_MS = 6000;
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

/** Tipo dedotto da simbolo e nome: basta per ETF/ETC comuni, altrimenti si sceglie nel form. */
export function inferAssetClass(h: Pick<Holding, "id" | "name">): AssetClass {
  const n = h.name.toLowerCase();
  if (cryptoFor(h.id) || /bitcoin|ethereum|solana|crypto|\bbtc\b|\beth\b/.test(n)) return "crypto";
  if (/\bgold\b|\boro\b/.test(n)) return "oro";
  if (/commodit|materie prime|silver|argento|oil|petrolio/.test(n)) return "materie";
  if (/bond|treasury|govt|government|aggregate|obbligaz|corporate|\bbtp\b/.test(n)) return "obbligazioni";
  return "azioni";
}

// Borse preferite per ETF europei quotati in EUR
const SUFFIX_PREF = [".DE", ".MI", ".AS", ".PA", ".F", ".SG", ".MU", ".DU", ".BE", ".HM", ".VI"];

/** Campo Redis: l'ISIN da solo per Trade Republic (come le posizioni già salvate), "broker|ISIN" per gli altri. */
export const holdingKey = (broker: Broker, id: string) => (broker === DEFAULT_BROKER ? id : `${broker}|${id}`);

const withBroker = (h: Holding): Holding => ({
  ...h,
  broker: isBroker(h.broker) ? h.broker : DEFAULT_BROKER,
  avgCost: h.avgCost ?? null,
  assetClass: isAssetClass(h.assetClass) ? h.assetClass : null,
});

export async function listHoldings(): Promise<Holding[]> {
  const r = redis();
  if (!r) return [];
  const data = await r.hgetall<Record<string, Holding>>(KEY);
  return Object.values(data ?? {})
    .map(withBroker)
    .sort((a, b) => BROKERS.indexOf(a.broker) - BROKERS.indexOf(b.broker) || a.name.localeCompare(b.name));
}

export async function saveHolding(h: Holding): Promise<void> {
  const r = redis();
  if (!r) throw new Error("Storage non configurato");
  await r.hset(KEY, { [holdingKey(h.broker, h.id)]: h });
}

export async function removeHolding(broker: Broker, id: string): Promise<void> {
  const r = redis();
  if (!r) return;
  await r.hdel(KEY, holdingKey(broker, id));
}

export type SyncPosition = { id: string; name?: string; qty: number; avgCost?: number | null; price?: number | null };

/**
 * Sostituisce tutte le posizioni di un broker con quelle ricevute (le vendute spariscono).
 * Mantiene simbolo Yahoo, nome personalizzato e tipo già salvati per gli ISIN che restano.
 */
export async function syncBroker(broker: Broker, positions: SyncPosition[]): Promise<{ saved: number; removed: number }> {
  const r = redis();
  if (!r) throw new Error("Storage non configurato");
  const current = (await listHoldings()).filter((h) => h.broker === broker);
  const now = new Date().toISOString();
  const next: Record<string, Holding> = {};
  for (const p of positions) {
    const id = p.id.trim().toUpperCase();
    const prev = current.find((h) => h.id === id);
    // Strumento nuovo (o senza simbolo): risolvi simbolo e nome una volta sola
    const resolved = prev?.symbol ? null : await resolveSymbol(id).catch(() => null);
    next[holdingKey(broker, id)] = {
      id,
      broker,
      symbol: prev?.symbol ?? resolved?.symbol ?? null,
      name: prev?.name ?? p.name ?? resolved?.name ?? id,
      qty: p.qty,
      manualPrice: p.price ?? prev?.manualPrice ?? null,
      avgCost: p.avgCost ?? prev?.avgCost ?? null,
      assetClass: prev?.assetClass ?? null,
      updatedAt: now,
    };
  }
  const gone = current.map((h) => holdingKey(broker, h.id)).filter((k) => !(k in next));
  if (gone.length) await r.hdel(KEY, ...gone);
  if (Object.keys(next).length) await r.hset(KEY, next);
  return { saved: Object.keys(next).length, removed: gone.length };
}

export async function getHolding(broker: Broker, id: string): Promise<Holding | null> {
  const r = redis();
  if (!r) return null;
  const h = await r.hget<Holding>(KEY, holdingKey(broker, id));
  return h ? withBroker(h) : null;
}

async function yahoo<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(PRICE_TIMEOUT_MS) });
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
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(PRICE_TIMEOUT_MS) });
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
    const res = await fetch(`${JUSTETF}/it/etf-profile.html?isin=${isin}`, { headers: { "User-Agent": UA }, cache: "no-store", signal: AbortSignal.timeout(PRICE_TIMEOUT_MS) });
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
async function fetchLivePrice(h: Holding): Promise<{ price: number; time: string }> {
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

function view(h: Holding, price: number | null, rest: Pick<HoldingView, "priceSource" | "priceTime" | "error">): HoldingView {
  const value = price === null ? null : price * h.qty;
  const cost = h.avgCost ? h.avgCost * h.qty : null;
  return {
    ...h,
    ...rest,
    price,
    value,
    cls: h.assetClass ?? inferAssetClass(h),
    cost,
    gain: value !== null && cost !== null ? value - cost : null,
  };
}

export async function loadPortfolio(): Promise<HoldingView[]> {
  const holdings = await listHoldings();
  // Lo stesso strumento su più broker: una sola richiesta di prezzo, anche a cache vuota
  const inflight = new Map<string, Promise<{ price: number; time: string }>>();
  const livePrice = (h: Holding) => {
    const key = h.symbol ?? h.id;
    let p = inflight.get(key);
    if (!p) inflight.set(key, (p = fetchLivePrice(h)));
    return p;
  };
  return Promise.all(
    holdings.map(async (h): Promise<HoldingView> => {
      try {
        const { price, time } = await livePrice(h);
        return view(h, price, { priceSource: "live", priceTime: time });
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        if (h.manualPrice !== null) return view(h, h.manualPrice, { priceSource: "manuale", priceTime: h.updatedAt, error });
        return view(h, null, { priceSource: null, priceTime: null, error });
      }
    }),
  );
}

export type InstrumentView = { id: string; name: string; brokers: Broker[]; qty: number; value: number; cost: number | null; gain: number | null };

/** Somma per ISIN/simbolo le posizioni tenute su più broker. */
export function byInstrument(holdings: HoldingView[]): InstrumentView[] {
  const map = new Map<string, InstrumentView & { costKnown: boolean }>();
  for (const h of holdings) {
    const cur = map.get(h.id) ?? { id: h.id, name: h.name, brokers: [], qty: 0, value: 0, cost: 0, gain: null, costKnown: true };
    cur.brokers.push(h.broker);
    cur.qty += h.qty;
    cur.value += h.value ?? 0;
    if (h.cost === null) cur.costKnown = false;
    else cur.cost = (cur.cost ?? 0) + h.cost;
    map.set(h.id, cur);
  }
  return [...map.values()]
    .map(({ costKnown, ...i }) => (costKnown ? { ...i, gain: i.value - (i.cost ?? 0) } : { ...i, cost: null, gain: null }))
    .sort((a, b) => b.value - a.value);
}

/** Valore per tipo di investimento, dal più grande. */
export function byAssetClass(holdings: HoldingView[]): { cls: AssetClass; label: string; value: number }[] {
  const sums = new Map<AssetClass, number>();
  for (const h of holdings) sums.set(h.cls, (sums.get(h.cls) ?? 0) + (h.value ?? 0));
  return [...sums.entries()]
    .map(([cls, value]) => ({ cls, label: ASSET_CLASSES[cls], value }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
}

import "server-only";
import { redis } from "./store";
import { parseHicp, type Inflation } from "./inflation-parse";

export type { Inflation, InflationPoint, WealthImpact } from "./inflation-parse";
export { wealthImpact } from "./inflation-parse";

// IPCA (indice armonizzato, calcolato da ISTAT) da Eurostat: pubblico, senza chiave
const URL_HICP =
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr" +
  "?geo=IT&coicop18=TOTAL&unit=RCH_A&unit=RCH_MV12MAVR&unit=I25&lastTimePeriod=24";
const KEY = "saldi:inflation:v2"; // v2: con l'indice per mese
const TTL = 12 * 3600; // esce una volta al mese: 12 ore bastano
const TIMEOUT_MS = 4000;

/** Inflazione italiana degli ultimi 24 mesi, con cache Redis; null se Eurostat non risponde. */
export async function loadInflation(): Promise<Inflation | null> {
  const r = redis();
  const cached = r ? await r.get<Inflation>(KEY).catch(() => null) : null;
  if (cached?.series?.length && cached.index) return cached;
  try {
    const res = await fetch(URL_HICP, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Eurostat ${res.status}`);
    const value = parseHicp(await res.json());
    if (!value.series.length) return null;
    if (r) await r.set(KEY, value, { ex: TTL }).catch(() => undefined);
    return value;
  } catch {
    return null;
  }
}

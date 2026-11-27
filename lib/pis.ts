import "server-only";
import { EbError, listPisAspsps } from "./eb";
import { redis } from "./store";

/** Elenco delle banche di un paese che accettano bonifici via API, con i tipi di pagamento. */
export type PisCoverage = { aspsps: { name: string; types?: string[] }[] } | { error: string };

const KEY = (country: string) => `saldi:pis:${country}`;
const CACHE_SECONDS = 12 * 3600; // cambia di rado: basta rileggerlo un paio di volte al giorno

/** Messaggio leggibile da un errore di Enable Banking (il corpo è JSON con message/detail/error). */
export function describePisError(e: unknown): string {
  if (e instanceof EbError) {
    let detail = "";
    try {
      const j = JSON.parse(e.body) as { message?: string; detail?: unknown; error?: string };
      detail = [j.error, j.message, typeof j.detail === "string" ? j.detail : j.detail ? JSON.stringify(j.detail) : ""]
        .filter(Boolean)
        .join(": ");
    } catch {
      detail = e.body;
    }
    if (e.status === 401 || e.status === 403) {
      return `L'applicazione Enable Banking non può avviare bonifici (${e.status}${detail ? `: ${detail}` : ""}). Serve il servizio pagamenti (PIS) abilitato.`;
    }
    return `La banca ha rifiutato la richiesta (${e.status}${detail ? `: ${detail}` : ""})`;
  }
  if (e instanceof Error && e.name === "TimeoutError") return "Enable Banking non ha risposto in tempo, riprova";
  return e instanceof Error ? e.message : String(e);
}

async function readCountry(country: string): Promise<PisCoverage> {
  const r = redis();
  const cached = await r?.get<{ aspsps: { name: string; types?: string[] }[] }>(KEY(country));
  if (cached) return cached;
  try {
    const list = await listPisAspsps(country);
    const value = { aspsps: list.map((a) => ({ name: a.name, types: a.payments?.map((t) => t.payment_type) })) };
    await r?.set(KEY(country), value, { ex: CACHE_SECONDS });
    return value;
  } catch (e) {
    // Gli errori non si salvano: alla prossima apertura si riprova
    return { error: describePisError(e) };
  }
}

/** Copertura PIS per ogni paese delle banche collegate (una chiamata per paese, salvata 12 ore). */
export async function pisCoverage(countries: string[]): Promise<Record<string, PisCoverage>> {
  const unique = [...new Set(countries)];
  const results = await Promise.all(unique.map(readCountry));
  return Object.fromEntries(unique.map((c, i) => [c, results[i]]));
}

/** Origine pubblica della richiesta (su Vercel dagli header del proxy), per i metadati OAuth. */
export function requestOrigin(h: Headers): string {
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
}

/**
 * Indirizzo di ritorno da Enable Banking, uguale per collegamento conti e bonifici: deve coincidere
 * esattamente con uno dei Redirect URL registrati sull'applicazione.
 */
export function ebRedirectUrl(requestUrl: string): string {
  return process.env.EB_REDIRECT_URL ?? new URL("/api/eb/callback", requestUrl).toString();
}

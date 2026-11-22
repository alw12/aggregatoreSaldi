/**
 * OAuth 2.1 per il connettore di Claude: logica pura (testata in oauth.test.ts).
 * Il connettore usa l'Authorization Code con PKCE (solo S256) e la registrazione dinamica dei client.
 */

export const SCOPE = "saldi:read";
export const MCP_PATH = "/api/mcp";

export const CODE_TTL = 5 * 60; // secondi
export const ACCESS_TTL = 60 * 60;
export const REFRESH_TTL = 30 * 24 * 60 * 60;

/** Dove claude.ai e le app di Claude tornano dopo il login. */
const CLAUDE_CALLBACKS = ["https://claude.ai/api/mcp/auth_callback", "https://claude.com/api/mcp/auth_callback"];

/**
 * Un redirect è ammesso se è il callback di Claude, un indirizzo locale (Claude Code e Claude per
 * desktop ascoltano su localhost) o uno di quelli aggiunti in OAUTH_EXTRA_REDIRECTS.
 * Così nessun altro sito può farsi registrare come client e ricevere un codice.
 */
export function redirectAllowed(uri: string, extra: string[] = []): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash || u.username || u.password) return false;
  if (CLAUDE_CALLBACKS.includes(`${u.origin}${u.pathname}`) && !u.search) return true;
  if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]")) return true;
  return extra.includes(uri);
}

export const extraRedirects = (env: string | undefined) => (env ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const b64url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** Segreto casuale da 256 bit, con un prefisso leggibile ("saldi_at_…"). */
export function randomToken(prefix: string): string {
  return `${prefix}${b64url(crypto.getRandomValues(new Uint8Array(32)))}`;
}

/** I token si salvano solo come hash: chi legge il database non può usarli. */
export async function sha256(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** PKCE S256: BASE64URL(SHA256(verifier)) deve essere il challenge mandato all'inizio. */
export async function pkceOk(verifier: string, challenge: string): Promise<boolean> {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return safeEqual(b64url(d), challenge);
}

/** Confronto che non rivela con il tempo quanti caratteri coincidono. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const resourceUrl = (origin: string) => `${origin}${MCP_PATH}`;

/** RFC 9728: chi protegge il server MCP e dove fare il login. */
export function protectedResourceMetadata(origin: string) {
  return {
    resource: resourceUrl(origin),
    authorization_servers: [origin],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Saldi",
  };
}

/** RFC 8414: gli endpoint del server di autorizzazione. */
export function authServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    revocation_endpoint: `${origin}/api/oauth/revoke`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    revocation_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: [SCOPE],
    authorization_response_iss_parameter_supported: true,
  };
}

export type AuthMethod = "none" | "client_secret_post" | "client_secret_basic";

export type ClientRegistration = {
  redirect_uris: string[];
  client_name: string;
  token_endpoint_auth_method: AuthMethod;
};

/** Valida la richiesta di registrazione dinamica (RFC 7591). Errore = messaggio per `invalid_*`. */
export function parseRegistration(body: unknown, extra: string[] = []): ClientRegistration | { error: string; description: string } {
  if (!body || typeof body !== "object") return { error: "invalid_client_metadata", description: "Corpo JSON mancante" };
  const b = body as Record<string, unknown>;
  const uris = b.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > 10 || !uris.every((u) => typeof u === "string"))
    return { error: "invalid_redirect_uri", description: "redirect_uris obbligatorio" };
  const bad = uris.find((u) => !redirectAllowed(u, extra));
  if (bad) return { error: "invalid_redirect_uri", description: `Redirect non ammesso: ${bad}` };
  const method = (b.token_endpoint_auth_method ?? "none") as string;
  if (!["none", "client_secret_post", "client_secret_basic"].includes(method))
    return { error: "invalid_client_metadata", description: `token_endpoint_auth_method non supportato: ${method}` };
  const grants = b.grant_types;
  if (grants !== undefined && (!Array.isArray(grants) || grants.some((g) => g !== "authorization_code" && g !== "refresh_token")))
    return { error: "invalid_client_metadata", description: "Sono supportati solo authorization_code e refresh_token" };
  const types = b.response_types;
  if (types !== undefined && (!Array.isArray(types) || types.some((t) => t !== "code")))
    return { error: "invalid_client_metadata", description: "È supportato solo response_type=code" };
  const name = typeof b.client_name === "string" && b.client_name.trim() ? b.client_name.trim().slice(0, 80) : "Client senza nome";
  return { redirect_uris: uris as string[], client_name: name, token_endpoint_auth_method: method as AuthMethod };
}

export type AuthorizeParams = {
  clientId: string;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  scope: string;
  resource: string | null;
};

/**
 * Controlla i parametri di /oauth/authorize. `fatal` = non si può tornare al client (client o
 * redirect sconosciuti): si mostra l'errore; altrimenti si rimanda l'errore al redirect.
 */
export function parseAuthorize(
  q: URLSearchParams,
  client: { redirect_uris: string[] } | null,
  origin: string,
): { ok: AuthorizeParams } | { fatal: string } | { error: string; description: string; redirectUri: string; state: string | null } {
  const clientId = q.get("client_id");
  const redirectUri = q.get("redirect_uri");
  if (!clientId || !client) return { fatal: "Client sconosciuto: ricollega il connettore da Claude." };
  // Con un solo redirect registrato si può omettere; altrimenti deve coincidere con uno registrato
  const ru = redirectUri ?? (client.redirect_uris.length === 1 ? client.redirect_uris[0] : null);
  if (!ru || !client.redirect_uris.includes(ru)) return { fatal: "Indirizzo di ritorno non registrato per questo client." };
  const state = q.get("state");
  const fail = (error: string, description: string) => ({ error, description, redirectUri: ru, state });
  if (q.get("response_type") !== "code") return fail("unsupported_response_type", "Solo response_type=code");
  const challenge = q.get("code_challenge");
  if (!challenge || !/^[A-Za-z0-9\-_]{43}$/.test(challenge)) return fail("invalid_request", "code_challenge PKCE obbligatorio");
  if ((q.get("code_challenge_method") ?? "plain") !== "S256") return fail("invalid_request", "Solo code_challenge_method=S256");
  const scope = q.get("scope");
  if (scope && !scope.split(" ").every((s) => s === SCOPE)) return fail("invalid_scope", `Scope supportato: ${SCOPE}`);
  const resource = q.get("resource");
  if (resource && resource.replace(/\/$/, "") !== resourceUrl(origin)) return fail("invalid_target", "Risorsa sconosciuta");
  return { ok: { clientId, redirectUri: ru, state, codeChallenge: challenge, scope: SCOPE, resource } };
}

/** L'indirizzo di ritorno al client, con il codice o con l'errore (e `iss`, RFC 9207). */
export function redirectBack(redirectUri: string, params: Record<string, string | null>, issuer: string): string {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v !== null) u.searchParams.set(k, v);
  u.searchParams.set("iss", issuer);
  return u.toString();
}

/** Credenziali del client: Basic nell'header o client_id/client_secret nel corpo. */
export function clientCredentials(authHeader: string | null, form: URLSearchParams): { id: string | null; secret: string | null; basic: boolean } {
  if (authHeader?.toLowerCase().startsWith("basic ")) {
    try {
      const raw = atob(authHeader.slice(6).trim());
      const i = raw.indexOf(":");
      if (i > 0) return { id: decodeURIComponent(raw.slice(0, i)), secret: decodeURIComponent(raw.slice(i + 1)), basic: true };
    } catch {
      /* header malformato: si prova con il corpo */
    }
  }
  return { id: form.get("client_id"), secret: form.get("client_secret"), basic: false };
}

/** Bearer token dall'header Authorization. */
export function bearer(authHeader: string | null): string | null {
  const m = authHeader?.match(/^Bearer\s+(\S+)\s*$/i);
  return m ? m[1] : null;
}

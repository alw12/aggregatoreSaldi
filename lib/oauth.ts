import "server-only";
import { redis } from "./store";
import {
  ACCESS_TTL,
  CODE_TTL,
  REFRESH_TTL,
  SCOPE,
  pkceOk,
  randomToken,
  safeEqual,
  sha256,
  type AuthMethod,
  type AuthorizeParams,
  type ClientRegistration,
} from "./oauth-core";

/**
 * Stato OAuth del connettore su Redis. I token e i codici sono salvati solo come hash SHA-256.
 * Ogni autorizzazione è un "grant": revocarlo invalida subito tutti i suoi token, perché a ogni uso
 * si controlla che il grant esista ancora.
 */

const P = "saldi:oauth";
const CLIENT_TTL = 180 * 24 * 60 * 60; // un client mai usato per 6 mesi sparisce
const MAX_CLIENTS = 50;
const LOG_MAX = 200;

export type Client = ClientRegistration & { client_id: string; secretHash: string | null; createdAt: string };
export type Grant = { id: string; clientId: string; clientName: string; createdAt: string; lastUsedAt: string | null };
type Code = AuthorizeParams & { clientName: string };
type TokenRec = { grantId: string; clientId: string; resource: string | null };
export type LogEntry = { at: string; grantId: string; clientName: string; tool: string; ok: boolean };

function db() {
  const r = redis();
  if (!r) throw new Error("Storage non configurato");
  return r;
}

// ── Client (registrazione dinamica) ─────────────────────────────

export async function registerClient(reg: ClientRegistration): Promise<{ client: Client; secret: string | null }> {
  const r = db();
  // Limite alle registrazioni: chiunque può chiamare /register, il database non deve riempirsi
  const n = await r.incr(`${P}:reg-count`);
  if (n === 1) await r.expire(`${P}:reg-count`, 24 * 60 * 60);
  if (n > MAX_CLIENTS) throw new Error("Troppe registrazioni oggi: riprova domani");
  const secret = reg.token_endpoint_auth_method === "none" ? null : randomToken("saldi_cs_");
  const client: Client = {
    ...reg,
    client_id: randomToken("saldi_c_"),
    secretHash: secret ? await sha256(secret) : null,
    createdAt: new Date().toISOString(),
  };
  await r.set(`${P}:client:${client.client_id}`, client, { ex: CLIENT_TTL });
  return { client, secret };
}

export async function getClient(id: string | null): Promise<Client | null> {
  if (!id || id.length > 200) return null;
  return (await db().get<Client>(`${P}:client:${id}`)) ?? null;
}

/** Il client si autentica come si è registrato: nessun segreto, oppure il segreto giusto nel modo giusto. */
export async function clientAuthenticated(c: Client, secret: string | null, basic: boolean): Promise<boolean> {
  const method: AuthMethod = c.token_endpoint_auth_method;
  if (method === "none") return !secret;
  if (!secret || !c.secretHash) return false;
  if (method === "client_secret_basic" && !basic) return false;
  if (method === "client_secret_post" && basic) return false;
  return safeEqual(await sha256(secret), c.secretHash);
}

// ── Consenso e codici ───────────────────────────────────────────

/** I parametri controllati restano sul server: il modulo di consenso porta solo questo identificativo. */
export async function startConsent(p: AuthorizeParams): Promise<string> {
  const nonce = randomToken("");
  await db().set(`${P}:consent:${await sha256(nonce)}`, p, { ex: 10 * 60 });
  return nonce;
}

export async function takeConsent(nonce: string): Promise<AuthorizeParams | null> {
  if (!nonce || nonce.length > 100) return null;
  return (await db().getdel<AuthorizeParams>(`${P}:consent:${await sha256(nonce)}`)) ?? null;
}

/** Consenso dato: un codice monouso da scambiare con i token. L'accesso (grant) nasce solo allo scambio riuscito. */
export async function issueCode(p: AuthorizeParams, clientName: string): Promise<string> {
  const code = randomToken("saldi_code_");
  const rec: Code = { ...p, clientName };
  await db().set(`${P}:code:${await sha256(code)}`, rec, { ex: CODE_TTL });
  return code;
}

export type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
};

export type TokenError = { error: string; error_description: string; status?: number };

async function grantExists(id: string): Promise<Grant | null> {
  return (await db().hget<Grant>(`${P}:grants`, id)) ?? null;
}

async function issueTokens(rec: TokenRec): Promise<TokenResponse> {
  const r = db();
  const access = randomToken("saldi_at_");
  const refresh = randomToken("saldi_rt_");
  await Promise.all([
    r.set(`${P}:at:${await sha256(access)}`, rec, { ex: ACCESS_TTL }),
    r.set(`${P}:rt:${await sha256(refresh)}`, rec, { ex: REFRESH_TTL }),
  ]);
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL, refresh_token: refresh, scope: SCOPE };
}

/** authorization_code: il codice vale una volta sola, per lo stesso client, redirect e verifier PKCE. */
export async function exchangeCode(c: Client, code: string, redirectUri: string | null, verifier: string | null): Promise<TokenResponse | TokenError> {
  const rec = code ? await db().getdel<Code>(`${P}:code:${await sha256(code)}`) : null;
  const invalid = { error: "invalid_grant", error_description: "Codice non valido o scaduto" };
  if (!rec || rec.clientId !== c.client_id) return invalid;
  if (redirectUri !== null && redirectUri !== rec.redirectUri) return { error: "invalid_grant", error_description: "redirect_uri diverso" };
  if (!verifier || !(await pkceOk(verifier, rec.codeChallenge))) return { error: "invalid_grant", error_description: "Verifica PKCE fallita" };
  const grant: Grant = { id: randomToken("g_").slice(0, 24), clientId: c.client_id, clientName: rec.clientName, createdAt: new Date().toISOString(), lastUsedAt: null };
  await db().hset(`${P}:grants`, { [grant.id]: grant });
  return issueTokens({ grantId: grant.id, clientId: c.client_id, resource: rec.resource });
}

/** refresh_token: il vecchio token si consuma e ne nasce uno nuovo (rotazione). */
export async function refreshTokens(c: Client, refresh: string): Promise<TokenResponse | TokenError> {
  const rec = refresh ? await db().getdel<TokenRec>(`${P}:rt:${await sha256(refresh)}`) : null;
  if (!rec || rec.clientId !== c.client_id || !(await grantExists(rec.grantId)))
    return { error: "invalid_grant", error_description: "Refresh token non valido, scaduto o revocato" };
  return issueTokens(rec);
}

export async function revokeToken(token: string): Promise<void> {
  const h = await sha256(token);
  await db().del(`${P}:at:${h}`, `${P}:rt:${h}`);
}

/** Token di accesso valido → grant; null se scaduto, sconosciuto o revocato. */
export async function checkAccessToken(token: string | null, resource: string): Promise<Grant | null> {
  if (!token || token.length > 200) return null;
  const rec = await db().get<TokenRec>(`${P}:at:${await sha256(token)}`);
  if (!rec) return null;
  if (rec.resource && rec.resource.replace(/\/$/, "") !== resource) return null;
  return grantExists(rec.grantId);
}

// ── Accessi visibili nella pagina Claude ───────────────────────

export async function listGrants(): Promise<Grant[]> {
  const all = (await db().hgetall<Record<string, Grant>>(`${P}:grants`)) ?? {};
  return Object.values(all).sort((a, b) => (b.lastUsedAt ?? b.createdAt).localeCompare(a.lastUsedAt ?? a.createdAt));
}

export async function revokeGrant(id: string): Promise<void> {
  await db().hdel(`${P}:grants`, id);
}

export async function revokeAllGrants(): Promise<void> {
  await db().del(`${P}:grants`);
}

/** Registro delle letture: quando, quale strumento, da quale accesso. */
export async function logCall(g: Grant, tool: string, ok: boolean): Promise<void> {
  const r = db();
  const now = new Date().toISOString();
  const entry: LogEntry = { at: now, grantId: g.id, clientName: g.clientName, tool, ok };
  await Promise.all([
    r.lpush(`${P}:log`, entry).then(() => r.ltrim(`${P}:log`, 0, LOG_MAX - 1)),
    // Il grant potrebbe essere stato revocato nel frattempo: si aggiorna solo se c'è ancora
    grantExists(g.id).then((cur) => (cur ? r.hset(`${P}:grants`, { [g.id]: { ...cur, lastUsedAt: now } }) : 0)),
  ]);
}

export async function recentLog(n = 30): Promise<LogEntry[]> {
  return (await db().lrange<LogEntry>(`${P}:log`, 0, n - 1)) ?? [];
}

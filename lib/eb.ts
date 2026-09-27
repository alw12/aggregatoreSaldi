import "server-only";
import { SignJWT, importPKCS8 } from "jose";
import { createPrivateKey } from "node:crypto";

const API = process.env.EB_API_URL ?? "https://api.enablebanking.com";

export type Amount = { currency: string; amount: string };
export type Balance = {
  name: string;
  balance_amount: Amount;
  balance_type: string;
  reference_date?: string;
  last_change_date_time?: string;
};
export type Aspsp = {
  name: string;
  country: string;
  logo: string;
  bic?: string;
  beta: boolean;
  psu_types: string[];
  maximum_consent_validity: number;
};
export type AccountResource = {
  uid?: string;
  account_id?: { iban?: string; other?: { identification: string } };
  name?: string;
  details?: string;
  product?: string;
  currency: string;
  cash_account_type: string;
  identification_hash: string;
};

export class EbError extends Error {
  constructor(public status: number, public body: string) {
    super(`Enable Banking ${status}: ${body.slice(0, 300)}`);
  }
}

let cachedKey: CryptoKey | null = null;
let cachedJwt: { token: string; exp: number } | null = null;

async function privateKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const raw = process.env.EB_PRIVATE_KEY;
  if (!raw) throw new Error("EB_PRIVATE_KEY non configurata");
  // Accetta PEM con newline reali, con "\n" letterali, o in base64 (comodo per le env di Vercel)
  let pem = raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
  if (!pem.includes("-----BEGIN")) pem = Buffer.from(pem, "base64").toString("utf8");
  // Normalizza PKCS#1 ("BEGIN RSA PRIVATE KEY") in PKCS#8
  const pkcs8 = createPrivateKey(pem).export({ type: "pkcs8", format: "pem" }).toString();
  cachedKey = await importPKCS8(pkcs8, "RS256");
  return cachedKey;
}

async function apiJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.exp - 60 > now) return cachedJwt.token;
  const appId = process.env.EB_APP_ID;
  if (!appId) throw new Error("EB_APP_ID non configurata");
  const exp = now + 3600;
  const token = await new SignJWT({})
    .setProtectedHeader({ typ: "JWT", alg: "RS256", kid: appId })
    .setIssuer("enablebanking.com")
    .setAudience("api.enablebanking.com")
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(await privateKey());
  cachedJwt = { token, exp };
  return token;
}

export type PsuHeaders = Record<string, string>;

async function ebFetch<T>(path: string, init: RequestInit & { psu?: PsuHeaders } = {}): Promise<T> {
  const { psu, headers, ...rest } = init;
  const res = await fetch(API + path, {
    ...rest,
    headers: {
      Authorization: `Bearer ${await apiJwt()}`,
      Accept: "application/json",
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(psu ?? {}),
      ...(headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new EbError(res.status, text);
  return JSON.parse(text) as T;
}

export async function listAspsps(country: string): Promise<Aspsp[]> {
  const data = await ebFetch<{ aspsps: Aspsp[] }>(
    `/aspsps?country=${encodeURIComponent(country)}&psu_type=personal&service=AIS`,
  );
  return data.aspsps.sort((a, b) => a.name.localeCompare(b.name));
}

export async function startAuth(params: {
  aspsp: { name: string; country: string };
  validUntil: Date;
  redirectUrl: string;
  state: string;
}): Promise<{ url: string; authorization_id: string }> {
  return ebFetch("/auth", {
    method: "POST",
    body: JSON.stringify({
      access: {
        valid_until: params.validUntil.toISOString(),
        balances: true,
        transactions: true,
      },
      aspsp: params.aspsp,
      state: params.state,
      redirect_url: params.redirectUrl,
      psu_type: "personal",
      language: "it",
    }),
  });
}

export async function authorizeSession(code: string): Promise<{
  session_id: string;
  accounts: AccountResource[];
  aspsp: { name: string; country: string };
  access: { valid_until: string };
}> {
  return ebFetch("/sessions", { method: "POST", body: JSON.stringify({ code }) });
}

export async function deleteSession(sessionId: string): Promise<void> {
  await ebFetch(`/sessions/${sessionId}`, { method: "DELETE" });
}

export async function getBalances(accountUid: string, psu?: PsuHeaders): Promise<Balance[]> {
  const data = await ebFetch<{ balances: Balance[] }>(`/accounts/${accountUid}/balances`, { psu });
  return data.balances;
}

// Ordine di preferenza: disponibile "in tempo reale" prima, poi contabile
const PREFERRED = ["ITAV", "CLAV", "XPCD", "ITBD", "CLBD", "VALU", "OPAV", "OPBD", "FWAV", "INFO", "OTHR", "PRCD"];

export function pickBalance(balances: Balance[]): Balance | undefined {
  return [...balances].sort(
    (a, b) =>
      (PREFERRED.indexOf(a.balance_type) + 100) % 100 - (PREFERRED.indexOf(b.balance_type) + 100) % 100,
  )[0];
}

import { SignJWT, jwtVerify } from "jose";

export const AUTH_COOKIE = "saldi_auth";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 giorni

let keyPromise: Promise<Uint8Array> | null = null;

/**
 * Chiave HMAC derivata da AUTH_SECRET + APP_PASSWORD (SHA-256): funziona con segreti di
 * qualsiasi lunghezza, e cambiare la password invalida automaticamente le sessioni aperte.
 */
function secretKey(): Promise<Uint8Array> {
  const password = process.env.APP_PASSWORD;
  if (!password) throw new Error("APP_PASSWORD non configurata");
  keyPromise ??= crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(`saldi-auth|${process.env.AUTH_SECRET ?? ""}|${password}`))
    .then((d) => new Uint8Array(d));
  return keyPromise;
}

export async function createAuthToken(): Promise<string> {
  return new SignJWT({ sub: "owner" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(await secretKey());
}

export async function verifyAuthToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, await secretKey(), { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}

/** Confronto a tempo costante tramite digest SHA-256 di entrambe le stringhe. */
export async function checkPassword(candidate: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) throw new Error("APP_PASSWORD non configurata");
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(candidate)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const va = new Uint8Array(a);
  const vb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

export const authCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};

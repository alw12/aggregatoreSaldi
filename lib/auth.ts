import { SignJWT, jwtVerify } from "jose";

export const AUTH_COOKIE = "saldi_auth";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 giorni

/** "owner" = APP_PASSWORD (obbligatoria), "bot" = BOT_PASSWORD (facoltativa: se assente l'utente bot è disattivato). */
export type Role = "owner" | "bot";

function passwordFor(role: Role): string | undefined {
  if (role === "bot") return process.env.BOT_PASSWORD || undefined;
  const password = process.env.APP_PASSWORD;
  if (!password) throw new Error("APP_PASSWORD non configurata");
  return password;
}

const keyPromises = new Map<Role, Promise<Uint8Array>>();

/**
 * Chiave HMAC per ruolo, derivata da AUTH_SECRET + password del ruolo (SHA-256): funziona con
 * segreti di qualsiasi lunghezza, e cambiare una password invalida solo le sessioni di quel ruolo.
 */
function secretKey(role: Role): Promise<Uint8Array> | null {
  const password = passwordFor(role);
  if (!password) return null;
  const prefix = role === "owner" ? "saldi-auth" : "saldi-auth-bot";
  let p = keyPromises.get(role);
  if (!p) {
    p = crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(`${prefix}|${process.env.AUTH_SECRET ?? ""}|${password}`))
      .then((d) => new Uint8Array(d));
    keyPromises.set(role, p);
  }
  return p;
}

export async function createAuthToken(role: Role): Promise<string> {
  const key = secretKey(role);
  if (!key) throw new Error(`password per il ruolo ${role} non configurata`);
  return new SignJWT({ sub: role })
    .setProtectedHeader({ alg: "HS256", kid: role })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(await key);
}

export async function verifyAuthToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(
      token,
      async (header) => {
        // I token emessi prima dell'utente bot non hanno kid: sono del proprietario
        const key = secretKey(header.kid === "bot" ? "bot" : "owner");
        if (!key) throw new Error("ruolo disattivato");
        return key;
      },
      { algorithms: ["HS256"] },
    );
    return true;
  } catch {
    return false;
  }
}

/** Confronto a tempo costante tramite digest SHA-256 di entrambe le stringhe. */
async function safeEqual(candidate: string, expected: string): Promise<boolean> {
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

/** Restituisce il ruolo a cui corrisponde la password, oppure null se non è valida. */
export async function checkPassword(candidate: string): Promise<Role | null> {
  const owner = passwordFor("owner")!;
  const bot = passwordFor("bot");
  const [isOwner, isBot] = await Promise.all([safeEqual(candidate, owner), bot ? safeEqual(candidate, bot) : false]);
  if (isOwner) return "owner";
  if (isBot) return "bot";
  return null;
}

export const authCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};

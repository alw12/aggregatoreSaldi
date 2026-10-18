import "server-only";

/** Confronto a tempo costante di un header "Bearer <token>" con un segreto (min 32 caratteri), tramite digest SHA-256. */
export async function bearerMatches(header: string | null, expected: string | undefined): Promise<boolean> {
  if (!expected || expected.length < 32 || !header?.startsWith("Bearer ")) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(header.slice(7))),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const va = new Uint8Array(a);
  const vb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

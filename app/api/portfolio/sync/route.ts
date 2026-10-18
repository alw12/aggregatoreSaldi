import { NextResponse, type NextRequest } from "next/server";
import { isBroker, syncBroker, type SyncPosition } from "@/lib/portfolio";

/**
 * Sincronizzazione delle posizioni di un broker da un job esterno (routine Claude con il
 * connettore Scalable). Fuori dal login a cookie: si autentica con `Authorization: Bearer SYNC_TOKEN`.
 *
 * Body: { broker: "Scalable Capital", positions: [{ id: ISIN, name?, qty, avgCost?, price? }] }
 * Sostituisce tutte le posizioni di quel broker.
 */
export async function POST(request: NextRequest) {
  if (!(await authorized(request.headers.get("authorization")))) {
    await new Promise((r) => setTimeout(r, 1500));
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { broker?: unknown; positions?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON non valido" }, { status: 400 });
  }
  if (!isBroker(body.broker)) return NextResponse.json({ error: "broker non valido" }, { status: 400 });
  if (!Array.isArray(body.positions) || body.positions.length > 200) {
    return NextResponse.json({ error: "positions deve essere un array" }, { status: 400 });
  }

  const positions: SyncPosition[] = [];
  for (const raw of body.positions as Record<string, unknown>[]) {
    const id = typeof raw?.id === "string" ? raw.id.trim().toUpperCase() : "";
    const qty = Number(raw?.qty);
    const opt = (v: unknown) => (v === undefined || v === null ? null : Number(v));
    const avgCost = opt(raw?.avgCost);
    const price = opt(raw?.price);
    if (!id || !Number.isFinite(qty) || qty < 0) return NextResponse.json({ error: `posizione non valida: ${id || "?"}` }, { status: 400 });
    if ([avgCost, price].some((n) => n !== null && (!Number.isFinite(n) || n < 0))) {
      return NextResponse.json({ error: `prezzo non valido: ${id}` }, { status: 400 });
    }
    // Quote a zero = posizione chiusa: non la salviamo, così viene rimossa
    if (qty > 0) positions.push({ id, name: typeof raw.name === "string" ? raw.name.slice(0, 120) : undefined, qty, avgCost, price });
  }

  const result = await syncBroker(body.broker, positions);
  return NextResponse.json({ ok: true, broker: body.broker, ...result });
}

/** Confronto a tempo costante tramite digest SHA-256, come per la password. */
async function authorized(header: string | null): Promise<boolean> {
  const expected = process.env.SYNC_TOKEN;
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

import { NextResponse, type NextRequest } from "next/server";
import { removeSubscription, saveSubscription, sendToAll } from "@/lib/push";

/** Iscrizione del dispositivo alle notifiche (dietro login, come tutte le API). */
export async function POST(request: NextRequest) {
  let body: { action?: unknown; subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }; endpoint?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON non valido" }, { status: 400 });
  }

  if (body.action === "subscribe") {
    const s = body.subscription;
    const endpoint = typeof s?.endpoint === "string" ? s.endpoint : "";
    const p256dh = typeof s?.keys?.p256dh === "string" ? s.keys.p256dh : "";
    const auth = typeof s?.keys?.auth === "string" ? s.keys.auth : "";
    if (!endpoint.startsWith("https://") || !p256dh || !auth) return NextResponse.json({ error: "iscrizione non valida" }, { status: 400 });
    await saveSubscription({ endpoint, keys: { p256dh, auth } }, request.headers.get("user-agent") ?? "");
    return NextResponse.json({ ok: true });
  }
  if (body.action === "unsubscribe" && typeof body.endpoint === "string") {
    await removeSubscription(body.endpoint);
    return NextResponse.json({ ok: true });
  }
  if (body.action === "test") {
    const sent = await sendToAll({ title: "Saldi", body: "Le notifiche funzionano.", url: "/avvisi", tag: "saldi-test" });
    return NextResponse.json({ ok: sent > 0, sent });
  }
  return NextResponse.json({ error: "azione non valida" }, { status: 400 });
}

import "server-only";
import * as webpush from "web-push";
import type { PushSubscription } from "web-push";
import { redis } from "./store";
import type { Alert } from "./alerts";

/** Notifiche push (Web Push con chiavi VAPID): funzionano su Android e, con Saldi aggiunta alla Home, su iPhone. */

const SUBS = "saldi:push";
const SENT = "saldi:alerts:sent";
const REPEAT_DAYS = 7; // la stessa situazione viene ricordata al massimo una volta a settimana

export type StoredSubscription = PushSubscription & { createdAt: string; device: string };

export const pushPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? null;

function configured(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "https://visualizzasaldi.vercel.app", pub, priv);
  return true;
}

async function idOf(endpoint: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return Buffer.from(d).toString("hex").slice(0, 32);
}

export async function listSubscriptions(): Promise<StoredSubscription[]> {
  const r = redis();
  if (!r) return [];
  return Object.values((await r.hgetall<Record<string, StoredSubscription>>(SUBS)) ?? {});
}

export async function saveSubscription(sub: PushSubscription, device: string): Promise<void> {
  const r = redis();
  if (!r) throw new Error("Storage non configurato");
  const value: StoredSubscription = { endpoint: sub.endpoint, keys: sub.keys, createdAt: new Date().toISOString(), device: device.slice(0, 120) };
  await r.hset(SUBS, { [await idOf(sub.endpoint)]: value });
}

export async function removeSubscription(endpoint: string): Promise<void> {
  const r = redis();
  if (!r) return;
  await r.hdel(SUBS, await idOf(endpoint));
}

export type PushMessage = { title: string; body: string; url?: string; tag?: string };

/** Invia a tutti i dispositivi iscritti; toglie quelli che il servizio push dà per scaduti. */
export async function sendToAll(msg: PushMessage): Promise<number> {
  if (!configured()) return 0;
  const subs = await listSubscriptions();
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(s, JSON.stringify(msg), { TTL: 24 * 3600, urgency: "normal" });
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await removeSubscription(s.endpoint);
      }
    }),
  );
  return sent;
}

/** Notifica solo gli avvisi nuovi o non ricordati da una settimana. Restituisce quanti avvisi ha comunicato. */
export async function notifyAlerts(alerts: Alert[], today: string): Promise<number> {
  const r = redis();
  if (!r || !alerts.length || !configured()) return 0;
  const sent = (await r.hgetall<Record<string, string>>(SENT)) ?? {};
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - REPEAT_DAYS);
  const fresh = alerts.filter((a) => !sent[a.key] || sent[a.key] <= cutoff.toISOString().slice(0, 10));
  if (!fresh.length) return 0;

  const msg: PushMessage =
    fresh.length === 1
      ? { title: "Saldi", body: fresh[0].text, url: fresh[0].href, tag: "saldi-alerts" }
      : { title: `Saldi: ${fresh.length} cose da controllare`, body: fresh.map((a) => `• ${a.text}`).join("\n"), url: "/avvisi", tag: "saldi-alerts" };
  if ((await sendToAll(msg)) === 0) return 0;

  await r.hset(SENT, Object.fromEntries(fresh.map((a) => [a.key, today])));
  // Dimentica le chiavi vecchie, così il registro non cresce all'infinito
  const old = Object.entries(sent).filter(([, d]) => d < cutoff.toISOString().slice(0, 10)).map(([k]) => k);
  if (old.length) await r.hdel(SENT, ...old);
  return fresh.length;
}

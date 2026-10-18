"use client";

import { useEffect, useState } from "react";

type State = "loading" | "unsupported" | "install" | "denied" | "off" | "on" | "nokey";

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const post = (body: unknown) =>
  fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

/** Attiva o disattiva le notifiche su questo dispositivo. */
export function PushControl({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    Promise.resolve().then(async () => {
      if (!publicKey) return setState("nokey");
      // Su iPhone le notifiche esistono solo per le app aggiunte alla schermata Home
      if (ios && !standalone) return setState("install");
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    });
  }, [publicKey]);

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      if ((await Notification.requestPermission()) !== "granted") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey!) });
      const res = await post({ action: "subscribe", subscription: sub.toJSON() });
      if (!res.ok) throw new Error(res.error ?? "errore");
      setState("on");
    } catch (e) {
      setMsg(`Non sono riuscito ad attivarle: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (sub) {
        await post({ action: "unsubscribe", endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    const res = await post({ action: "test" }).catch(() => ({ ok: false }));
    setMsg(res.ok ? "Inviata: dovrebbe arrivare tra qualche secondo." : "Non inviata: riprova a disattivare e riattivare.");
    setBusy(false);
  }

  return (
    <div>
      {state === "loading" && <p className="chart-note">Controllo il dispositivo…</p>}
      {state === "nokey" && <p className="chart-note">Le notifiche non sono ancora configurate sul server (mancano le chiavi VAPID).</p>}
      {state === "unsupported" && <p className="chart-note">Questo browser non supporta le notifiche push.</p>}
      {state === "install" && (
        <p className="chart-note">
          Su iPhone le notifiche arrivano solo all’app sulla schermata Home: in Safari tocca <strong>Condividi</strong> ▸{" "}
          <strong>Aggiungi alla schermata Home</strong>, apri Saldi da lì e torna in questa pagina.
        </p>
      )}
      {state === "denied" && <p className="chart-note">Le notifiche sono bloccate: riattivale dalle impostazioni del browser per questo sito.</p>}
      {(state === "off" || state === "on") && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {state === "off" ? (
            <button className="btn btn-primary" type="button" onClick={enable} disabled={busy}>Attiva le notifiche</button>
          ) : (
            <>
              <span className="change up">Attive su questo dispositivo</span>
              <button className="btn" type="button" onClick={test} disabled={busy}>Prova</button>
              <button className="btn btn-ghost danger" type="button" onClick={disable} disabled={busy}>Disattiva</button>
            </>
          )}
        </div>
      )}
      {msg && <p className="chart-note" style={{ margin: "10px 0 0" }}>{msg}</p>}
    </div>
  );
}

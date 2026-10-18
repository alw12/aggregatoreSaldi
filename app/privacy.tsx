"use client";

import { useSyncExternalStore } from "react";

// Stessa chiave letta dallo script in <head> di app/layout.tsx
const KEY = "saldi:private";

/** Lo stato vive come attributo su <html>, impostato prima del primo disegno dallo script in layout. */
function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-private"] });
  return () => mo.disconnect();
}
const getSnapshot = () => document.documentElement.dataset.private === "1";

/** Nasconde gli importi (sfocati) quando apri l'app davanti ad altri. Resta ricordato su questo dispositivo. */
export function PrivacyToggle() {
  const hidden = useSyncExternalStore(subscribe, getSnapshot, () => false);
  const toggle = () => {
    const next = !hidden;
    if (next) document.documentElement.dataset.private = "1";
    else delete document.documentElement.dataset.private;
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {}
  };
  return (
    <button className="btn btn-quiet icon-btn" type="button" onClick={toggle} aria-pressed={hidden} title={hidden ? "Mostra gli importi" : "Nascondi gli importi"}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
        {hidden && <path d="M4 4l16 16" />}
      </svg>
      <span className="sr-only">{hidden ? "Mostra gli importi" : "Nascondi gli importi"}</span>
    </button>
  );
}


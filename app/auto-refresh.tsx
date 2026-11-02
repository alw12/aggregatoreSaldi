"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const PENDING_DELAY_MS = 5_000; // il tempo che serve alla rilettura in background
const EVERY_MS = 5 * 60_000;
const MIN_GAP_MS = 60_000;

/**
 * Tiene i saldi aggiornati mentre l'app è aperta: ricarica i dati quando la rilettura in background
 * è finita (`pending`), quando torni sull'app dal telefono e ogni 5 minuti se resta in primo piano.
 */
export function AutoRefresh({ pending }: { pending: boolean }) {
  const router = useRouter();
  const last = useRef(0);
  const pendingDone = useRef(false);

  useEffect(() => {
    last.current = Date.now();
  });

  // Una sola volta: se la banca non ha ancora risposto, al giro dopo restano i saldi salvati
  useEffect(() => {
    if (!pending || pendingDone.current) return;
    pendingDone.current = true;
    const t = setTimeout(() => router.refresh(), PENDING_DELAY_MS);
    return () => clearTimeout(t);
  }, [pending, router]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible" || Date.now() - last.current < MIN_GAP_MS) return;
      last.current = Date.now();
      pendingDone.current = false;
      router.refresh();
    };
    const timer = setInterval(refresh, EVERY_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  return null;
}

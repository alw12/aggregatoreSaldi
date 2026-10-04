import "server-only";
import { redis } from "./store";

/** Fotografia giornaliera del patrimonio, per il grafico dell'andamento. */
export type Snapshot = {
  date: string; // YYYY-MM-DD, ora di Roma
  total: number; // netto: liquidità + investimenti − carte
  cash: number;
  invested: number;
  cards: number;
};

const KEY = "saldi:history";

export function todayRome(now = new Date()): string {
  // en-CA formatta come YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(now);
}

/** Salva (o sovrascrive) la fotografia di oggi. Errori ignorati: il grafico non deve rompere la dashboard. */
export async function recordSnapshot(s: Omit<Snapshot, "date">): Promise<void> {
  const r = redis();
  if (!r) return;
  const round = (n: number) => Math.round(n * 100) / 100;
  const snap: Snapshot = {
    date: todayRome(),
    total: round(s.total),
    cash: round(s.cash),
    invested: round(s.invested),
    cards: round(s.cards),
  };
  try {
    await r.hset(KEY, { [snap.date]: snap });
  } catch {
    // storico non essenziale
  }
}

/** Ultimi `days` giorni registrati, dal più vecchio. */
export async function loadHistory(days = 365): Promise<Snapshot[]> {
  const r = redis();
  if (!r) return [];
  const data = (await r.hgetall<Record<string, Snapshot>>(KEY)) ?? {};
  return Object.values(data)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-days);
}

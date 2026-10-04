import "server-only";
import { redis } from "./store";

/** Cose che possiedi, con un valore stimato a mano. Sezione a parte: non entrano nel patrimonio netto. */
export const CATEGORIES = [
  "Casa e immobili",
  "Auto e moto",
  "Elettronica",
  "Orologi e gioielli",
  "Arredamento",
  "Collezioni e arte",
  "Altro",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type Possession = {
  id: string;
  name: string;
  category: Category;
  value: number; // valore attuale stimato, EUR
  purchasePrice: number | null;
  purchaseDate: string | null; // YYYY-MM-DD
  note: string | null;
  updatedAt: string;
};

const KEY = "saldi:beni";

export async function listPossessions(): Promise<Possession[]> {
  const r = redis();
  if (!r) return [];
  const data = await r.hgetall<Record<string, Possession>>(KEY);
  return Object.values(data ?? {}).sort((a, b) => b.value - a.value);
}

export async function getPossession(id: string): Promise<Possession | null> {
  const r = redis();
  if (!r) return null;
  return (await r.hget<Possession>(KEY, id)) ?? null;
}

export async function savePossession(p: Possession): Promise<void> {
  const r = redis();
  if (!r) throw new Error("Storage non configurato");
  await r.hset(KEY, { [p.id]: p });
}

export async function removePossession(id: string): Promise<void> {
  const r = redis();
  if (!r) return;
  await r.hdel(KEY, id);
}

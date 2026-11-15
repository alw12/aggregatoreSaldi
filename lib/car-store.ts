import "server-only";
import { redis } from "./store";
import type { CarSettings } from "./car";

const KEY = "saldi:auto";

/** null = mai salvate: la pagina indovina il debito dell'auto dal nome. */
export async function getCarSettings(): Promise<CarSettings | null> {
  const r = redis();
  if (!r) return null;
  const s = await r.get<CarSettings>(KEY);
  return s ? { loanId: s.loanId ?? null, annual: s.annual ?? {}, kmYear: s.kmYear ?? null } : null;
}

export async function saveCarSettings(s: CarSettings): Promise<void> {
  const r = redis();
  if (!r) throw new Error("Storage non configurato");
  await r.set(KEY, s);
}

import "server-only";
import { redis } from "./store";

/** Esito dell'ultimo job giornaliero (app/api/cron/daily), mostrato nella pagina Avvisi. */
export type CronRun = { at: string; snapshot: boolean; alerts: number; notified: number; error?: string };

const KEY = "saldi:cron:last";

export async function saveCronRun(run: CronRun): Promise<void> {
  await redis()?.set(KEY, run);
}

export async function lastCronRun(): Promise<CronRun | null> {
  return (await redis()?.get<CronRun>(KEY)) ?? null;
}

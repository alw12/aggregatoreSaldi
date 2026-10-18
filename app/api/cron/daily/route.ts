import { NextResponse, type NextRequest } from "next/server";
import { loadOverview } from "@/lib/overview";
import { recordSnapshot, todayRome } from "@/lib/history";
import { computeAlerts } from "@/lib/alerts";
import { notifyAlerts } from "@/lib/push";
import { saveCronRun, type CronRun } from "@/lib/cron";
import { bearerMatches } from "@/lib/token";

export const maxDuration = 60;

/**
 * Job giornaliero (Vercel Cron, vedi vercel.json): salva la fotografia del patrimonio anche nei giorni
 * in cui non apri Saldi e manda le notifiche per gli avvisi nuovi. Vercel lo chiama con
 * `Authorization: Bearer CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  if (!(await bearerMatches(request.headers.get("authorization"), process.env.CRON_SECRET))) {
    await new Promise((r) => setTimeout(r, 1500));
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const today = todayRome();
  const run: CronRun = { at: new Date().toISOString(), snapshot: false, alerts: 0, notified: 0 };
  try {
    // Senza header PSU: la banca conta la lettura nel limite di 4 al giorno, una basta
    const o = await loadOverview({});
    if (o.today) {
      await recordSnapshot(o.today);
      run.snapshot = true;
    }
    const alerts = computeAlerts(o, today);
    run.alerts = alerts.length;
    run.notified = await notifyAlerts(alerts, today);
  } catch (e) {
    run.error = e instanceof Error ? e.message.slice(0, 300) : String(e);
  }
  await saveCronRun(run);
  return NextResponse.json(run, { status: run.error ? 500 : 200 });
}

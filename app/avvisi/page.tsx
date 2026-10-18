import Link from "next/link";
import { headers } from "next/headers";
import { Nav } from "@/app/nav";
import { psuHeadersFrom } from "@/lib/data";
import { hasStore } from "@/lib/store";
import { loadOverview } from "@/lib/overview";
import { computeAlerts, CARD_THRESHOLD, type Alert } from "@/lib/alerts";
import { todayRome } from "@/lib/history";
import { lastCronRun, type CronRun } from "@/lib/cron";
import { listSubscriptions, pushPublicKey } from "@/lib/push";
import { PushControl } from "./push-control";

export const dynamic = "force-dynamic";

const when = (iso: string) =>
  new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }).format(new Date(iso));

/** Avvisi attivi, notifiche push e stato del controllo automatico giornaliero. */
export default async function AlertsPage() {
  let alerts: Alert[] = [];
  let run: CronRun | null = null;
  let devices = 0;
  let error: string | null = null;
  if (hasStore()) {
    try {
      const [o, r, subs] = await Promise.all([loadOverview(psuHeadersFrom(await headers())), lastCronRun(), listSubscriptions()]);
      alerts = computeAlerts(o, todayRome());
      run = r;
      devices = subs.length;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <main className="container">
      <Nav current="/avvisi" />
      <h1 className="page-title">Avvisi</h1>
      <p className="page-lead">Le cose da sistemare, calcolate sui tuoi conti. Ogni sera Saldi le ricontrolla da sola e ti avvisa di quelle nuove.</p>
      {error && <div className="notice error">{error}</div>}

      <section className="card chart-card">
        <div className="chart-title">Adesso</div>
        {alerts.length ? (
          <ul className="alerts" style={{ margin: "8px 0 0" }}>
            {alerts.map((a) => (
              <li key={a.key} className={`alert ${a.level}`}>
                <Link href={a.href}>{a.text}</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="chart-note" style={{ marginBottom: 0 }}>Niente da sistemare.</p>
        )}
      </section>

      <section className="card chart-card">
        <div className="chart-title">Notifiche su questo dispositivo</div>
        <p className="chart-note">
          Ti avviso quando un consenso bancario sta per scadere, una carta supera l’{Math.round(CARD_THRESHOLD * 100)}% del plafond o sta per
          addebitare, si avvicina la scadenza di un debito o un buono è scaduto. La stessa cosa al massimo una volta a settimana.
          {devices > 0 && <> Dispositivi iscritti: {devices}.</>}
        </p>
        <PushControl publicKey={pushPublicKey()} />
      </section>

      <section className="card chart-card">
        <div className="chart-title">Controllo automatico</div>
        <p className="chart-note" style={{ marginBottom: 0 }}>
          {run ? (
            <>
              Ultimo: {when(run.at)}.{" "}
              {run.error
                ? <>Non è andato a buon fine: {run.error}</>
                : <>{run.snapshot ? "Fotografia del patrimonio salvata" : "Fotografia non salvata (qualche conto non era leggibile)"}; {run.alerts} {run.alerts === 1 ? "avviso" : "avvisi"}, {run.notified} {run.notified === 1 ? "notificato" : "notificati"}.</>}
            </>
          ) : (
            "Non ancora eseguito: parte ogni sera verso le 21."
          )}
        </p>
      </section>
    </main>
  );
}

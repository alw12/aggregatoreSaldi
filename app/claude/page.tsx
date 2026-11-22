import { headers } from "next/headers";
import { Nav } from "@/app/nav";
import { hasStore } from "@/lib/store";
import { listGrants, recentLog, type Grant, type LogEntry } from "@/lib/oauth";
import { resourceUrl } from "@/lib/oauth-core";
import { requestOrigin } from "@/lib/origin";
import { CopyField } from "./copy-field";

export const dynamic = "force-dynamic";

const when = (iso: string) =>
  new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }).format(new Date(iso));

/** Strumenti in parole semplici, per il registro. */
const TOOL_LABELS: Record<string, string> = {
  riepilogo: "Riepilogo",
  conti: "Conti e saldi",
  movimenti: "Movimenti",
  spese_per_categoria: "Spese per categoria",
  budget: "Budget",
  spese_ricorrenti: "Spese ricorrenti",
  report_mese: "Report del mese",
  flussi_mensili: "Entrate e uscite per mese",
  portafoglio: "Investimenti",
  debiti_e_carte: "Debiti e carte",
  beni: "Beni",
  storico_patrimonio: "Andamento del patrimonio",
  cose_strane: "Avvisi e spese strane",
  inflazione: "Inflazione",
  spese_730: "Spese 730",
  costo_auto: "Costo dell’auto",
};

/** Collegare Claude ai propri dati: indirizzo del connettore, accessi attivi da revocare, ultime letture. */
export default async function ClaudePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const url = resourceUrl(requestOrigin(await headers()));
  let grants: Grant[] = [];
  let log: LogEntry[] = [];
  let error: string | null = null;
  if (hasStore()) {
    try {
      [grants, log] = await Promise.all([listGrants(), recentLog(30)]);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  } else error = "Storage non configurato.";

  return (
    <main className="container">
      <Nav current="/claude" />
      <h1 className="page-title">Claude</h1>
      <p className="page-lead">
        Collega Saldi a Claude e fagli domande sui tuoi soldi dall’app Claude o da claude.ai, con l’abbonamento che hai già. Claude legge
        soltanto: non può spostare soldi né cambiare nulla.
      </p>
      {error && <div className="notice error">{error}</div>}
      {sp.revocato && <div className="notice">Accesso revocato: Claude non può più leggere i dati con quel collegamento.</div>}

      <section className="card chart-card">
        <div className="chart-title">Collega Claude</div>
        <ol className="steps-list">
          <li>Su claude.ai apri <strong>Impostazioni → Connettori</strong> e scegli <strong>Aggiungi connettore personalizzato</strong>.</li>
          <li>
            Come nome scrivi <strong>Saldi</strong> e come indirizzo incolla:
            <CopyField value={url} />
          </li>
          <li>Premi <strong>Connetti</strong>: si apre Saldi, entri con la tua password e premi <strong>Consenti</strong>.</li>
          <li>In una chat attiva il connettore Saldi e chiedi, per esempio, “quanto ho speso in bollette questo mese?”.</li>
        </ol>
        <p className="chart-note" style={{ margin: "10px 0 0" }}>
          Il connettore vale anche nell’app Claude per telefono e computer. Usa i saldi già letti da Saldi: non interroga le banche.
        </p>
      </section>

      <h2 className="section-head">Accessi attivi</h2>
      {grants.length ? (
        <section className="card bank claude-list">
          {grants.map((g) => (
            <div key={g.id} className="account">
              <div>
                <div className="account-label">{g.clientName}</div>
                <div className="account-iban">
                  Autorizzato il {when(g.createdAt)} · {g.lastUsedAt ? `ultima lettura ${when(g.lastUsedAt)}` : "mai usato"}
                </div>
              </div>
              <form method="post" action="/api/oauth/grants">
                <input type="hidden" name="id" value={g.id} />
                <button className="btn btn-ghost danger" type="submit">Revoca</button>
              </form>
            </div>
          ))}
          {grants.length > 1 && (
            <form method="post" action="/api/oauth/grants" className="group-foot">
              <input type="hidden" name="id" value="*" />
              <button className="btn btn-ghost danger" type="submit">Revoca tutti</button>
            </form>
          )}
        </section>
      ) : (
        <p className="chart-note">Nessun accesso: Claude non può leggere i tuoi dati.</p>
      )}

      <h2 className="section-head">Ultime letture</h2>
      {log.length ? (
        <section className="card bank claude-list">
          {log.map((l, i) => (
            <div key={`${l.at}-${i}`} className="account">
              <div>
                <div className="account-label">{TOOL_LABELS[l.tool] ?? l.tool}</div>
                <div className="account-iban">{l.clientName}</div>
              </div>
              <div className="account-iban" style={{ textAlign: "right" }}>
                {when(l.at)}
                {!l.ok && <div className="err">non riuscita</div>}
              </div>
            </div>
          ))}
        </section>
      ) : (
        <p className="chart-note">Ancora nessuna lettura.</p>
      )}
    </main>
  );
}

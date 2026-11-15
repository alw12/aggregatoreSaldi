import Link from "next/link";
import { headers } from "next/headers";
import { Nav } from "@/app/nav";
import { psuHeadersFrom } from "@/lib/data";
import { hasStore, listSessions } from "@/lib/store";
import { loadMovements } from "@/lib/transactions";
import { deductionYears, listDeductions } from "@/lib/deductions-store";
import { FRANCHIGIA, VET_LIMIT, summarizeDeductions, type Deduction } from "@/lib/deductions";
import { displayParty } from "@/lib/party";
import { todayRome } from "@/lib/history";

export const dynamic = "force-dynamic";

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(n);
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });

/** Spese sanitarie e veterinarie dell'anno, per controllare il 730 precompilato. */
export default async function DeductionsPage({ searchParams }: PageProps<"/730">) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const ok = sp.ok === "1";
  const today = todayRome();

  let items: Deduction[] = [];
  let years: string[] = [];
  let loadError: string | null = null;
  let year = today.slice(0, 4);
  if (hasStore()) {
    try {
      // Leggere i movimenti salva le spese detraibili nuove (cache di 6 ore)
      if ((await listSessions()).length) await loadMovements(psuHeadersFrom(await headers())).catch(() => null);
      years = await deductionYears();
      year = typeof sp.anno === "string" && /^\d{4}$/.test(sp.anno) ? sp.anno : (years[0] ?? year);
      items = await listDeductions(year);
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
  }
  const allYears = [...new Set([...years, today.slice(0, 4)])].sort().reverse();
  const s = summarizeDeductions(items);
  const first = items.filter((d) => d.source === "auto").map((d) => d.date).sort()[0];

  return (
    <main className="container">
      <Nav current="/730" />
      <h1 className="page-title">Spese per il 730</h1>
      <p className="page-lead">
        Farmacie, medici, dentisti, ottici, analisi e veterinari pagati dai conti collegati. Ti tornano il 19% di quello che supera {eur(FRANCHIGIA)} l’anno.
      </p>

      {loadError && <div className="notice error">{loadError}</div>}
      {error && <div className="notice error">{error}</div>}
      {ok && <div className="notice ok">Spesa aggiunta.</div>}

      {allYears.length > 1 && (
        <nav className="periods" aria-label="Anno">
          {allYears.map((y) => (
            <Link key={y} className="period" href={`/730?anno=${y}`} aria-current={y === year ? "page" : undefined}>
              {y}
            </Link>
          ))}
        </nav>
      )}

      <div className="tiles">
        <div className="tile">
          <span className="tile-label">Spese sanitarie {year}</span>
          <span className="tile-value">{eur(s.health)}</span>
          <span className="tile-sub">{s.health > FRANCHIGIA ? `${eur(s.health - FRANCHIGIA)} oltre la franchigia` : `sotto la franchigia di ${eur(FRANCHIGIA)}`}</span>
        </div>
        {s.vet > 0 && (
          <div className="tile">
            <span className="tile-label">Veterinarie</span>
            <span className="tile-value">{eur(s.vet)}</span>
            <span className="tile-sub">contano fino a {eur(VET_LIMIT)}</span>
          </div>
        )}
        <div className="tile">
          <span className="tile-label">Ti tornano circa</span>
          <span className="tile-value">{eur(s.back)}</span>
          <span className="tile-sub">19%, nel 730 dell’anno dopo</span>
        </div>
      </div>

      <section className="card chart-card">
        <div className="chart-title">Spese trovate</div>
        <p className="chart-note">
          {first ? `Salvate dal ${shortDate(first)}: ` : ""}la banca dà solo gli ultimi mesi, quindi le tengo da parte man mano. Togli quelle che non sono spese
          sanitarie (es. in farmacia anche cosmetici) e aggiungi quelle pagate in contanti.
        </p>
        {items.length === 0 ? (
          <p className="chart-note" style={{ marginBottom: 0 }}>Nessuna spesa sanitaria nel {year}, per ora.</p>
        ) : (
          <div className="tx-list">
            {items.map((d) => (
              <div key={d.id} className={`ded${d.excluded ? " off" : ""}`}>
                <span className="ded-date">{shortDate(d.date)}</span>
                <span className="ded-main">
                  <span className="tx-party">{displayParty(d.party)}</span>
                  <span className="rec-meta">
                    {d.type === "veterinaria" ? "Veterinaria" : "Sanitaria"}
                    {d.source === "manuale" ? " · aggiunta a mano" : ""}
                    {d.excluded ? " · esclusa" : ""}
                  </span>
                </span>
                <span className="ded-amt">{eur(d.amount)}</span>
                <form method="post" action="/api/730">
                  <input type="hidden" name="year" value={year} />
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="action" value={d.source === "manuale" ? "delete" : "toggle"} />
                  <button className="btn btn-ghost" type="submit">{d.source === "manuale" ? "Elimina" : d.excluded ? "Includi" : "Escludi"}</button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>

      <form className="card form-grid" method="post" action="/api/730">
        <div className="form-title">Aggiungi una spesa</div>
        <p className="form-hint">Per quelle pagate in contanti o da un conto non collegato.</p>
        <input type="hidden" name="action" value="add" />
        <input type="hidden" name="year" value={year} />
        <label>
          Data
          <input name="date" type="date" required defaultValue={today} />
        </label>
        <label>
          A chi (farmacia, medico…)
          <input name="party" required maxLength={80} placeholder="es. Dentista Rossi" />
        </label>
        <label>
          Importo in €
          <input name="amount" required inputMode="decimal" placeholder="es. 80" />
        </label>
        <label>
          Tipo
          <select name="type" defaultValue="sanitaria">
            <option value="sanitaria">Sanitaria</option>
            <option value="veterinaria">Veterinaria</option>
          </select>
        </label>
        <button className="btn btn-primary" type="submit">Aggiungi</button>
      </form>

      <p className="fineprint">
        Stima indicativa, non è una consulenza fiscale. Molte di queste spese sono già nel 730 precompilato (Sistema Tessera Sanitaria): usa l’elenco per
        controllare che ci siano tutte. Servono lo scontrino o la fattura con il tuo codice fiscale; medici e dentisti vanno pagati con carta o bonifico.
      </p>
    </main>
  );
}

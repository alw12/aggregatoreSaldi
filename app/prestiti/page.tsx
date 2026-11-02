import Link from "next/link";
import { itDate } from "@/lib/loan-math";
import { loadLoans, type LoanView } from "@/lib/loans";

export const dynamic = "force-dynamic";

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);

export default async function LoansPage({ searchParams }: PageProps<"/prestiti">) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;

  let loans: LoanView[] = [];
  let loadError: string | null = null;
  try {
    loans = await loadLoans();
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="container">
      <header className="topbar">
        <h1>Prestiti</h1>
        <Link className="btn" href="/">← Dashboard</Link>
      </header>

      {error && <div className="notice error">{error}</div>}
      {loadError && <div className="notice error">{loadError}</div>}

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="bank-head">
          <div className="bank-name">Prestiti in corso</div>
          <div className="bank-sum">{eur(loans.reduce((s, l) => s + l.residual, 0))}</div>
        </div>
        {loans.length === 0 && <p className="bank-meta">Nessun prestito. Aggiungi il primo qui sotto.</p>}
        {loans.map((l) => (
          <div key={l.id} className="account">
            <div>
              <div className="account-label">{l.id}</div>
              <div className="bank-meta">
                {eur(l.principal)} in {l.count} rate da {eur(l.installment)} · pagate {l.paid}
                {l.nextDue ? <> · prossima {itDate(l.nextDue)}</> : <> · estinto</>} · ultima {itDate(l.lastDue)}
                <br />
                Ancora da pagare {eur(l.remaining)} · per estinguere oggi circa {eur(l.residual)}
              </div>
            </div>
            <form method="post" action="/api/prestiti">
              <input type="hidden" name="action" value="delete" />
              <input type="hidden" name="id" value={l.id} />
              <button className="btn btn-ghost" type="submit">Elimina</button>
            </form>
          </div>
        ))}
      </section>

      <form className="card form-grid" method="post" action="/api/prestiti">
        <div className="bank-name" style={{ marginBottom: 4 }}>Aggiungi o aggiorna prestito</div>
        <p className="bank-meta" style={{ margin: "0 0 8px" }}>
          Rate pagate e debito residuo si calcolano dalla data della prima rata. Il residuo è una stima: la cifra
          esatta la dà il conteggio di estinzione anticipata della finanziaria.
        </p>
        <label>
          Nome (per aggiornare, reinserisci lo stesso nome)
          <input name="id" required placeholder="es. Prestito auto" />
        </label>
        <label>
          Importo finanziato in €
          <input name="principal" required inputMode="decimal" placeholder="es. 10.000,00" />
        </label>
        <label>
          Rata mensile in €
          <input name="installment" required inputMode="decimal" placeholder="es. 250,00" />
        </label>
        <label>
          Numero totale di rate
          <input name="count" required inputMode="numeric" placeholder="es. 48" />
        </label>
        <label>
          Data della prima rata
          <input name="firstDue" type="date" required />
        </label>
        <button className="btn btn-primary" type="submit">Salva</button>
      </form>
    </main>
  );
}

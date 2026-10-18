import Link from "next/link";
import { Nav } from "@/app/nav";
import { listDebts, type Debt } from "@/lib/debts";
import { LoanPlan } from "./loan-plan";

export const dynamic = "force-dynamic";

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(n);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const it = (n: number) => String(n).replace(".", ",");

/** Debiti: sottratti dal patrimonio netto, con un contatore separato in panoramica. */
export default async function DebtsPage({ searchParams }: PageProps<"/debiti">) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const editId = typeof sp.edit === "string" ? sp.edit : null;

  let debts: Debt[] = [];
  let loadError: string | null = null;
  try {
    debts = await listDebts();
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }
  const total = debts.reduce((s, d) => s + d.amount, 0);
  const editing = editId ? debts.find((d) => d.id === editId) ?? null : null;

  return (
    <main className="container">
      <Nav current="/debiti" />
      <h1 className="page-title">Debiti</h1>
      <p className="page-lead">Vengono sottratti dal patrimonio netto e in panoramica hanno un contatore a parte.</p>

      {error && <div className="notice error">{error}</div>}
      {loadError && <div className="notice error">{loadError}</div>}

      <section className="card bank">
        <div className="bank-head">
          <div className="bank-name">Da restituire</div>
          {debts.length > 0 && <div className="bank-sum">{eur(total)}</div>}
        </div>
        {debts.length === 0 && <p className="bank-meta">Nessun debito registrato.</p>}
        {debts.map((d) => (
          <div key={d.id} className="account">
            <div>
              <div className="account-label">{d.name}</div>
              {(d.dueDate || d.note || d.installment) && (
                <div className="account-iban">
                  {d.installment ? <>{eur(d.installment)} al mese{d.rate != null ? `, TAEG ${it(d.rate)}%` : ""}</> : null}
                  {d.dueDate && <>{d.installment ? ", " : ""}entro il {day(d.dueDate)}</>}
                  {d.note && <>{d.dueDate || d.installment ? ". " : ""}{d.note}</>}
                </div>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="amount">{eur(d.amount)}</div>
              <div className="row-actions">
                <Link className="btn btn-ghost" href={`/debiti?edit=${d.id}`}>Modifica</Link>
                <form method="post" action="/api/debts" style={{ display: "inline" }}>
                  <input type="hidden" name="action" value="delete" />
                  <input type="hidden" name="id" value={d.id} />
                  <button className="btn btn-ghost danger" type="submit">Elimina</button>
                </form>
              </div>
            </div>
          </div>
        ))}
      </section>

      {debts
        .filter((d) => d.installment && d.amount > 0)
        .map((d) => (
          <LoanPlan key={d.id} name={d.name} balance={d.amount} installment={d.installment!} rate={d.rate ?? null} />
        ))}

      <form key={editing?.id ?? "new"} className="card form-grid" method="post" action="/api/debts">
        <div className="form-title">{editing ? `Modifica ${editing.name}` : "Registra un debito"}</div>
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <label>
          A chi o per cosa
          <input name="name" required placeholder="es. Prestito da Marco" defaultValue={editing?.name} />
        </label>
        <label>
          Importo da restituire in €
          <input name="amount" required inputMode="decimal" placeholder="es. 500" defaultValue={editing ? it(editing.amount) : undefined} />
        </label>
        <label>
          Da restituire entro (facoltativo)
          <input name="dueDate" type="date" defaultValue={editing?.dueDate ?? undefined} />
        </label>
        <label>
          Rata mensile in € (facoltativa, per i prestiti)
          <input name="installment" inputMode="decimal" placeholder="es. 185,40" defaultValue={editing?.installment ? it(editing.installment) : undefined} />
        </label>
        <label>
          TAEG in % (facoltativo, è scritto sul contratto)
          <input name="rate" inputMode="decimal" placeholder="es. 9,9" defaultValue={editing?.rate != null ? it(editing.rate) : undefined} />
        </label>
        <p className="form-hint">Con rata e TAEG vedi quando finisci di pagare e quanto risparmi restituendo prima.</p>
        <label>
          Nota (facoltativo)
          <input name="note" maxLength={300} placeholder="es. 50 € al mese" defaultValue={editing?.note ?? undefined} />
        </label>
        <button className="btn btn-primary" type="submit">Salva</button>
        {editing && <Link className="btn btn-ghost" href="/debiti">Annulla</Link>}
      </form>
    </main>
  );
}

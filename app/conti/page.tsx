import Link from "next/link";
import { listManualAccounts, type ManualAccount } from "@/lib/manual";

export const dynamic = "force-dynamic";

const fmt = (n: number, currency: string) => new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(n);
const when = (iso: string) =>
  new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }).format(new Date(iso));

export default async function ManualAccountsPage({ searchParams }: PageProps<"/conti">) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const editId = typeof sp.edit === "string" ? sp.edit : null;

  let accounts: ManualAccount[] = [];
  let loadError: string | null = null;
  try {
    accounts = await listManualAccounts();
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }
  const editing = editId ? accounts.find((a) => a.id === editId) ?? null : null;

  return (
    <main className="container">
      <header className="topbar">
        <h1>Conti manuali</h1>
        <Link className="btn" href="/">← Dashboard</Link>
      </header>

      {error && <div className="notice error">{error}</div>}
      {loadError && <div className="notice error">{loadError}</div>}

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="bank-head">
          <div className="bank-name">Conti</div>
        </div>
        {accounts.length === 0 && <p className="bank-meta">Nessun conto manuale. Aggiungi il primo qui sotto.</p>}
        {accounts.map((a) => (
          <div key={a.id} className="account">
            <div>
              <div className="account-label">{a.name}</div>
              <div className="account-iban">aggiornato {when(a.updatedAt)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className={`amount${a.amount < 0 ? " neg" : ""}`}>{fmt(a.amount, a.currency)}</div>
              <Link className="btn btn-ghost" href={`/conti?edit=${a.id}`}>Modifica</Link>
              <form method="post" action="/api/accounts" style={{ display: "inline" }}>
                <input type="hidden" name="action" value="delete" />
                <input type="hidden" name="id" value={a.id} />
                <button className="btn btn-ghost" type="submit">Elimina</button>
              </form>
            </div>
          </div>
        ))}
      </section>

      <form key={editing?.id ?? "new"} className="card form-grid" method="post" action="/api/accounts">
        <div className="bank-name" style={{ marginBottom: 4 }}>{editing ? `Modifica ${editing.name}` : "Aggiungi conto"}</div>
        <p className="bank-meta" style={{ margin: "0 0 8px" }}>
          Per conti che non si collegano via open banking (contanti, banche non supportate). Il saldo entra nella
          liquidità; poi puoi aggiornarlo al volo dalla dashboard.
        </p>
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <label>
          Nome
          <input name="name" required placeholder="es. Contanti · Conto Fineco" defaultValue={editing?.name} />
        </label>
        <label>
          Saldo
          <input name="amount" required inputMode="decimal" placeholder="es. 1.250,00" defaultValue={editing ? String(editing.amount).replace(".", ",") : undefined} />
        </label>
        <label>
          Valuta
          <input name="currency" maxLength={3} placeholder="EUR" autoCapitalize="characters" defaultValue={editing?.currency ?? "EUR"} />
        </label>
        <button className="btn btn-primary" type="submit">Salva</button>
        {editing && <Link className="btn btn-ghost" href="/conti">Annulla</Link>}
      </form>
    </main>
  );
}

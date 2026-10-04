import Link from "next/link";
import { loadCards, type CreditCardView } from "@/lib/cards";

export const dynamic = "force-dynamic";

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("it-IT", { timeZone: "UTC" });
const it = (n: number | null) => (n !== null ? String(n).replace(".", ",") : undefined);

export default async function CardsPage({ searchParams }: PageProps<"/carte">) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const editId = typeof sp.edit === "string" ? sp.edit : null;

  let cards: CreditCardView[] = [];
  let loadError: string | null = null;
  try {
    cards = await loadCards();
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }
  const total = cards.reduce((s, c) => s + c.balance, 0);
  const editing = editId ? cards.find((c) => c.id === editId) ?? null : null;

  return (
    <main className="container">
      <header className="topbar">
        <h1>Carte di credito</h1>
        <Link className="btn" href="/">← Dashboard</Link>
      </header>

      {error && <div className="notice error">{error}</div>}
      {loadError && <div className="notice error">{loadError}</div>}

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="bank-head">
          <div className="bank-name">Da addebitare</div>
          <div className={`bank-sum${total > 0 ? " neg" : ""}`}>{eur(-total)}</div>
        </div>
        {cards.length === 0 && <p className="bank-meta">Nessuna carta. Aggiungi la prima qui sotto.</p>}
        {cards.map((c) => (
          <div key={c.id} className="account">
            <div>
              <div className="account-label">{c.name}</div>
              <div className="account-iban">
                {c.last4 && <>•••• {c.last4}</>}
                {c.available !== null && <>{c.last4 ? " · " : ""}disponibile {eur(c.available)} su {eur(c.limit!)}</>}
                {c.nextCharge && <>{c.last4 || c.available !== null ? " · " : ""}addebito il {day(c.nextCharge)}</>}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className={`amount${c.balance > 0 ? " neg" : ""}`}>{eur(-c.balance)}</div>
              <Link className="btn btn-ghost" href={`/carte?edit=${c.id}`}>Modifica</Link>
              <form method="post" action="/api/cards" style={{ display: "inline" }}>
                <input type="hidden" name="action" value="delete" />
                <input type="hidden" name="id" value={c.id} />
                <button className="btn btn-ghost" type="submit">Elimina</button>
              </form>
            </div>
          </div>
        ))}
      </section>

      <form key={editing?.id ?? "new"} className="card form-grid" method="post" action="/api/cards">
        <div className="bank-name" style={{ marginBottom: 4 }}>{editing ? `Modifica ${editing.name}` : "Aggiungi carta"}</div>
        <p className="bank-meta" style={{ margin: "0 0 8px" }}>
          L’importo speso viene sottratto dal totale fino all’addebito. Aggiornalo dall’app della banca e azzeralo dopo
          l’addebito sul conto. Non inserire mai il numero completo, il CVV o la scadenza.
        </p>
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <label>
          Nome
          <input name="name" required placeholder="es. Amex Oro · Visa BBVA" defaultValue={editing?.name} />
        </label>
        <label>
          Ultime 4 cifre (facoltativo)
          <input name="last4" inputMode="numeric" maxLength={4} pattern="\d{4}" placeholder="es. 1234" autoComplete="off" defaultValue={editing?.last4 ?? undefined} />
        </label>
        <label>
          Speso da addebitare in €
          <input name="balance" required inputMode="decimal" placeholder="es. 432,10" defaultValue={it(editing?.balance ?? null)} />
        </label>
        <label>
          Plafond mensile in € (facoltativo)
          <input name="limit" inputMode="decimal" placeholder="es. 3.000" defaultValue={it(editing?.limit ?? null)} />
        </label>
        <label>
          Giorno di addebito (facoltativo)
          <input name="chargeDay" inputMode="numeric" placeholder="es. 15" defaultValue={editing?.chargeDay ?? undefined} />
        </label>
        <button className="btn btn-primary" type="submit">Salva</button>
        {editing && <Link className="btn btn-ghost" href="/carte">Annulla</Link>}
      </form>
    </main>
  );
}

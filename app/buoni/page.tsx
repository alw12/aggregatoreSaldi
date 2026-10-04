import Link from "next/link";
import { Nav } from "@/app/nav";
import { loadBonds, type BondView } from "@/lib/bonds";

export const dynamic = "force-dynamic";

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(n);
const num = (n: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 4 }).format(n);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("it-IT", { timeZone: "UTC" });

const SOURCE_LABEL: Record<BondView["valueSource"], string> = {
  manuale: "valore inserito",
  stima: "stima",
  nominale: "nominale, senza interessi",
};

export default async function BondsPage({ searchParams }: PageProps<"/buoni">) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const editId = typeof sp.edit === "string" ? sp.edit : null;

  let bonds: BondView[] = [];
  let loadError: string | null = null;
  try {
    bonds = await loadBonds();
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }
  const total = bonds.reduce((s, b) => s + b.value, 0);
  const editing = editId ? bonds.find((b) => b.id === editId) ?? null : null;

  return (
    <main className="container">
      <Nav current="/buoni" />
      <h1 className="page-title">Buoni fruttiferi postali</h1>

      {error && <div className="notice error">{error}</div>}
      {loadError && <div className="notice error">{loadError}</div>}

      <section className="card bank">
        <div className="bank-head">
          <div className="bank-name">Buoni</div>
          <div className="bank-sum">{eur(total)}</div>
        </div>
        {bonds.length === 0 && <p className="bank-meta">Nessun buono. Aggiungi il primo qui sotto.</p>}
        {bonds.map((b) => (
          <div key={b.id} className="account">
            <div>
              <div className="account-label">
                {b.name}
                {b.matured && <span className="badge">scaduto</span>}
              </div>
              <div className="account-iban">
                {eur(b.capital)} dal {day(b.subscribedAt)}, {b.yearsHeld} {b.yearsHeld === 1 ? "anno" : "anni"}
                {b.grossRate !== null && <>, {num(b.grossRate)}% lordo</>}
                {b.maturityYears !== null && <>, durata {b.maturityYears} anni</>}
                {" "}({SOURCE_LABEL[b.valueSource]})
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="amount">{eur(b.value)}</div>
              <div className="row-actions">
                <Link className="btn btn-ghost" href={`/buoni?edit=${b.id}`}>Modifica</Link>
                <form method="post" action="/api/bonds" style={{ display: "inline" }}>
                  <input type="hidden" name="action" value="delete" />
                  <input type="hidden" name="id" value={b.id} />
                  <button className="btn btn-ghost danger" type="submit">Elimina</button>
                </form>
              </div>
            </div>
          </div>
        ))}
      </section>

      <form key={editing?.id ?? "new"} className="card form-grid" method="post" action="/api/bonds">
        <div className="form-title">{editing ? `Modifica ${editing.name}` : "Aggiungi buono"}</div>
        <p className="form-hint">
          Poste non espone i buoni via open banking. Se inserisci il valore di rimborso netto (app BancoPosta ▸ Buoni) uso
          quello; altrimenti stimo il valore dal tasso, con interessi composti annui al netto del 12,5%.
        </p>
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <label>
          Nome o serie
          <input name="name" placeholder="es. BFP 3x4" defaultValue={editing?.name} />
        </label>
        <label>
          Importo sottoscritto in €
          <input name="capital" required inputMode="decimal" placeholder="es. 5.000" defaultValue={editing ? String(editing.capital).replace(".", ",") : undefined} />
        </label>
        <label>
          Data di sottoscrizione
          <input name="subscribedAt" type="date" required defaultValue={editing?.subscribedAt} />
        </label>
        <label>
          Tasso annuo lordo effettivo a scadenza in % (facoltativo)
          <input name="grossRate" inputMode="decimal" placeholder="es. 3,25" defaultValue={editing?.grossRate != null ? String(editing.grossRate).replace(".", ",") : undefined} />
        </label>
        <label>
          Durata in anni (facoltativo)
          <input name="maturityYears" inputMode="numeric" placeholder="es. 12" defaultValue={editing?.maturityYears ?? undefined} />
        </label>
        <label>
          Valore di rimborso netto attuale in € (facoltativo, ha la precedenza sulla stima)
          <input name="manualValue" inputMode="decimal" placeholder="es. 5.312,40" defaultValue={editing?.manualValue != null ? String(editing.manualValue).replace(".", ",") : undefined} />
        </label>
        <button className="btn btn-primary" type="submit">Salva</button>
        {editing && <Link className="btn btn-ghost" href="/buoni">Annulla</Link>}
      </form>
    </main>
  );
}

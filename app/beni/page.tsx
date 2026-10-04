import Link from "next/link";
import { Nav } from "@/app/nav";
import { HoldingBars } from "@/app/charts";
import { CATEGORIES, listPossessions, type Possession } from "@/lib/beni";

export const dynamic = "force-dynamic";

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(n);
const pct = (n: number) => new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 0, signDisplay: "exceptZero" }).format(n);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("it-IT", { month: "short", year: "numeric", timeZone: "UTC" });
const it = (n: number | null) => (n !== null ? String(n).replace(".", ",") : undefined);

/** Riga di dettaglio: quanto l'hai pagato e quanto vale rispetto ad allora. */
function purchaseLine(p: Possession) {
  const cap = (t: string | null) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
  if (p.purchasePrice === null && !p.purchaseDate) return cap(p.note);
  const parts: string[] = [];
  if (p.purchasePrice !== null) {
    parts.push(`pagato ${eur(p.purchasePrice)}`);
  }
  if (p.purchaseDate) parts.push(`${p.purchasePrice !== null ? "a" : "comprato a"} ${day(p.purchaseDate)}`);
  let line = parts.join(" ");
  if (p.purchasePrice !== null && p.purchasePrice > 0) line += ` (${pct(p.value / p.purchasePrice - 1)})`;
  return [cap(line), cap(p.note)].filter(Boolean).join(". ");
}

/** Beni: cose che possiedi. Sezione a parte, non sommata al patrimonio netto. */
export default async function PossessionsPage({ searchParams }: PageProps<"/beni">) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const editId = typeof sp.edit === "string" ? sp.edit : null;

  let items: Possession[] = [];
  let loadError: string | null = null;
  try {
    items = await listPossessions();
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }
  const total = items.reduce((s, p) => s + p.value, 0);
  const paid = items.reduce((s, p) => s + (p.purchasePrice ?? 0), 0);
  const editing = editId ? items.find((p) => p.id === editId) ?? null : null;
  const groups = CATEGORIES.map((c) => ({ category: c, items: items.filter((p) => p.category === c) })).filter((g) => g.items.length > 0);

  return (
    <main className="container">
      <Nav current="/beni" />
      <h1 className="page-title">Beni</h1>
      <p className="page-lead">Le cose che possiedi, con il valore che stimi oggi. Non vengono sommate al patrimonio netto.</p>

      {error && <div className="notice error">{error}</div>}
      {loadError && <div className="notice error">{loadError}</div>}

      {items.length > 0 && (
        <section className="card chart-card">
          <div className="bank-head">
            <div>
              <div className="bank-name">Valore stimato</div>
              <div className="bank-meta">
                {items.length} {items.length === 1 ? "bene" : "beni"}
                {paid > 0 && <>, pagati in tutto {eur(paid)}</>}
              </div>
            </div>
            <div className="bank-sum">{eur(total)}</div>
          </div>
          {groups.length > 1 && (
            <div style={{ marginTop: 14 }}>
              <HoldingBars
                caption="Per categoria"
                rows={groups.map((g) => ({ key: g.category, label: g.category, value: g.items.reduce((s, p) => s + p.value, 0) }))}
              />
            </div>
          )}
        </section>
      )}

      {groups.map((g) => (
        <section key={g.category} className="card bank">
          <div className="bank-head">
            <div className="bank-name">{g.category}</div>
            <div className="bank-sum">{eur(g.items.reduce((s, p) => s + p.value, 0))}</div>
          </div>
          {g.items.map((p) => (
            <div key={p.id} className="account">
              <div>
                <div className="account-label">{p.name}</div>
                {purchaseLine(p) && <div className="account-iban">{purchaseLine(p)}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="amount">{eur(p.value)}</div>
                <div className="row-actions">
                  <Link className="btn btn-ghost" href={`/beni?edit=${p.id}`}>Modifica</Link>
                  <form method="post" action="/api/beni" style={{ display: "inline" }}>
                    <input type="hidden" name="action" value="delete" />
                    <input type="hidden" name="id" value={p.id} />
                    <button className="btn btn-ghost danger" type="submit">Elimina</button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </section>
      ))}

      {items.length === 0 && !loadError && (
        <div className="card empty">
          <p>Ancora nessun bene. Aggiungi la prima cosa qui sotto: auto, telefono, orologio, casa…</p>
        </div>
      )}

      <form key={editing?.id ?? "new"} className="card form-grid" method="post" action="/api/beni" style={{ marginTop: 14 }}>
        <div className="form-title">{editing ? `Modifica ${editing.name}` : "Aggiungi un bene"}</div>
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <label>
          Nome
          <input name="name" required maxLength={120} placeholder="es. iPhone 15 Pro" defaultValue={editing?.name} />
        </label>
        <label>
          Categoria
          <select name="category" defaultValue={editing?.category ?? "Elettronica"}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>
          Valore attuale stimato in €
          <input name="value" required inputMode="decimal" placeholder="es. 650" defaultValue={it(editing?.value ?? null)} />
        </label>
        <label>
          Prezzo d’acquisto in € (facoltativo)
          <input name="purchasePrice" inputMode="decimal" placeholder="es. 1.239" defaultValue={it(editing?.purchasePrice ?? null)} />
        </label>
        <label>
          Data d’acquisto (facoltativo)
          <input name="purchaseDate" type="date" defaultValue={editing?.purchaseDate ?? undefined} />
        </label>
        <label>
          Nota (facoltativo)
          <input name="note" maxLength={300} placeholder="es. garanzia fino a marzo 2027" defaultValue={editing?.note ?? undefined} />
        </label>
        <button className="btn btn-primary" type="submit">Salva</button>
        {editing && <Link className="btn btn-ghost" href="/beni">Annulla</Link>}
      </form>
    </main>
  );
}

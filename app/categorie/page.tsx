import Link from "next/link";
import { headers } from "next/headers";
import { Nav } from "@/app/nav";
import { psuHeadersFrom } from "@/lib/data";
import { hasStore, listSessions } from "@/lib/store";
import { loadMovements } from "@/lib/transactions";
import { listDebts } from "@/lib/debts";
import { loadCatOpts } from "@/lib/cat-store";
import { CATEGORIES, autoCategory, categorize, type CatOpts, type CategoryKey } from "@/lib/categories";
import { displayParty, partyKey } from "@/lib/party";
import type { Movement } from "@/lib/flows";

export const dynamic = "force-dynamic";

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(n);
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });
const KEYS = Object.keys(CATEGORIES) as CategoryKey[];

/** Correggi la categoria di una controparte: vale per tutti i suoi movimenti, passati e futuri. */
export default async function CategoriesPage({ searchParams }: PageProps<"/categorie">) {
  const sp = await searchParams;
  const party = typeof sp.p === "string" ? sp.p.slice(0, 120) : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const ok = typeof sp.ok === "string" ? sp.ok : null;

  let moves: Movement[] = [];
  let cat: CatOpts = {};
  let loadError: string | null = null;
  if (hasStore()) {
    try {
      const [sessions, debts] = await Promise.all([listSessions(), listDebts()]);
      if (sessions.length) moves = (await loadMovements(psuHeadersFrom(await headers()))).moves;
      cat = await loadCatOpts(debts);
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
  }
  const rules = cat.rules ?? {};
  const key = party ? partyKey(party) : null;
  const same = key ? moves.filter((m) => m.kind === "out" && m.currency === "EUR" && partyKey(m.party) === key) : [];
  const sample = same[0] ?? (party ? { party, amount: -1, currency: "EUR" } : null);
  const current = sample ? categorize(sample, cat) : null;
  const auto = sample ? autoCategory(sample, cat) : null;
  const manual = key ? rules[key] ?? null : null;
  // Un esempio di nome per ogni correzione, dai movimenti letti
  const nameOf = new Map<string, string>();
  for (const m of moves) {
    const k = partyKey(m.party);
    if (rules[k] && !nameOf.has(k)) nameOf.set(k, displayParty(m.party));
  }
  const ruleList = Object.entries(rules).sort(([a], [b]) => a.localeCompare(b));

  return (
    <main className="container">
      <Nav current="/movimenti" />
      <h1 className="page-title">Categorie</h1>
      <p className="page-lead">
        Una correzione vale per tutti i movimenti della stessa controparte, passati e futuri: torta, budget, avvisi e CSV. Per correggere un movimento,
        toccalo in <Link href="/movimenti">Movimenti</Link>.
      </p>

      {loadError && <div className="notice error">{loadError}</div>}
      {error && <div className="notice error">{error}</div>}
      {ok === "1" && <div className="notice ok">Salvato: vale da subito per tutti i movimenti di questa controparte.</div>}
      {ok === "auto" && <div className="notice ok">Tornata la categoria automatica.</div>}

      {party && key && current && (
        <form className="card form-grid" method="post" action="/api/categories">
          <div className="form-title">{displayParty(party)}</div>
          <p className="form-hint" style={{ margin: 0 }}>
            {manual ? (
              <>Corretta a mano in <strong>{CATEGORIES[manual].label}</strong>; quella automatica sarebbe {CATEGORIES[auto!].label}.</>
            ) : (
              <>Adesso è in <strong>{CATEGORIES[current].label}</strong> (automatica).</>
            )}{" "}
            Vale per i movimenti riconosciuti come «{key}».
          </p>
          <input type="hidden" name="key" value={key} />
          <input type="hidden" name="party" value={party} />
          <fieldset className="cat-pick">
            <legend className="sr-only">Categoria</legend>
            {KEYS.map((k) => (
              <label key={k} className="cat-opt">
                <input type="radio" name="category" value={k} defaultChecked={k === current} />
                <span className={`swatch c${CATEGORIES[k].color}`} aria-hidden />
                {CATEGORIES[k].label}
              </label>
            ))}
          </fieldset>
          <button className="btn btn-primary" type="submit">Salva per tutti</button>
          {manual && (
            <button className="btn btn-ghost" type="submit" name="reset" value="1" formNoValidate>
              Torna alla categoria automatica
            </button>
          )}
          {same.length > 0 && (
            <div className="tx-list">
              <div className="due-head">{same.length === 1 ? "Il movimento" : `I ${same.length} movimenti`} di questa controparte negli ultimi mesi</div>
              {same.slice(0, 20).map((m) => (
                <div key={m.id} className="tx">
                  <span className="tx-party">{m.party}</span>
                  <span className="tx-meta">{shortDate(m.date)}, {m.account}</span>
                  <span className="tx-amount">{eur(m.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </form>
      )}

      <section className="card chart-card">
        <div className="chart-title">Le tue correzioni</div>
        {ruleList.length === 0 ? (
          <p className="chart-note" style={{ marginBottom: 0 }}>Nessuna: tutte le categorie sono quelle automatiche.</p>
        ) : (
          <div className="tx-list">
            {ruleList.map(([k, c]) => (
              <div key={k} className="rule">
                <span className={`swatch c${CATEGORIES[c].color}`} aria-hidden />
                <span className="rule-main">
                  <span className="tx-party">{nameOf.get(k) ?? k}</span>
                  <span className="rec-meta">«{k}» → {CATEGORIES[c].label}</span>
                </span>
                <form method="post" action="/api/categories">
                  <input type="hidden" name="key" value={k} />
                  <input type="hidden" name="category" value="auto" />
                  <button className="btn btn-ghost danger" type="submit">Togli</button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

import Link from "next/link";
import { loadPortfolio, type HoldingView } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
const num = (n: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 6 }).format(n);

export default async function PortfolioPage({ searchParams }: PageProps<"/portfolio">) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const warning = typeof sp.warning === "string" ? sp.warning : null;

  let holdings: HoldingView[] = [];
  let loadError: string | null = null;
  try {
    holdings = await loadPortfolio();
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }
  const total = holdings.reduce((s, h) => s + (h.value ?? 0), 0);

  return (
    <main className="container">
      <header className="topbar">
        <h1>Portafoglio Trade Republic</h1>
        <Link className="btn" href="/">← Dashboard</Link>
      </header>

      {error && <div className="notice error">{error}</div>}
      {warning && <div className="notice">{warning}</div>}
      {loadError && <div className="notice error">{loadError}</div>}

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="bank-head">
          <div className="bank-name">Posizioni</div>
          <div className="bank-sum">{eur(total)}</div>
        </div>
        {holdings.length === 0 && <p className="bank-meta">Nessuna posizione. Aggiungi la prima qui sotto.</p>}
        {holdings.map((h) => (
          <div key={h.id} className="account">
            <div>
              <div className="account-label">{h.name}</div>
              <div className="account-iban">
                {h.id}
                {h.symbol && h.symbol !== h.id ? ` · ${h.symbol}` : ""} · {num(h.qty)} quote
                {h.price !== null && <> · {eur(h.price)} ({h.priceSource})</>}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              {h.value !== null ? <div className="amount">{eur(h.value)}</div> : <div className="err">{h.error}</div>}
              <form method="post" action="/api/portfolio" style={{ display: "inline" }}>
                <input type="hidden" name="action" value="delete" />
                <input type="hidden" name="id" value={h.id} />
                <button className="btn btn-ghost" type="submit">Elimina</button>
              </form>
            </div>
          </div>
        ))}
      </section>

      <form className="card form-grid" method="post" action="/api/portfolio">
        <div className="bank-name" style={{ marginBottom: 4 }}>Aggiungi o aggiorna posizione</div>
        <p className="bank-meta" style={{ margin: "0 0 8px" }}>
          Per aggiornare dopo un acquisto del PAC, reinserisci lo stesso ISIN con le quote totali nuove.
        </p>
        <label>
          ISIN o simbolo
          <input name="id" required placeholder="IE00B44Z5B48 · per Bitcoin: BTC-EUR" autoCapitalize="characters" />
        </label>
        <label>
          Quote totali possedute
          <input name="qty" required inputMode="decimal" placeholder="es. 12,3456" />
        </label>
        <label>
          Nome (facoltativo)
          <input name="name" placeholder="es. MSCI ACWI" />
        </label>
        <label>
          Prezzo manuale in € (facoltativo, usato se il prezzo live non è disponibile)
          <input name="manualPrice" inputMode="decimal" placeholder="es. 245,10" />
        </label>
        <button className="btn btn-primary" type="submit">Salva</button>
      </form>
    </main>
  );
}

import { Nav } from "@/app/nav";
import { BROKERS, DEFAULT_BROKER, holdingKey, isBroker, loadPortfolio, type HoldingView } from "@/lib/portfolio";
import { HoldingBars } from "@/app/charts";

export const dynamic = "force-dynamic";

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(n);
const num = (n: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 6 }).format(n);

export default async function PortfolioPage({ searchParams }: PageProps<"/portfolio">) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const warning = typeof sp.warning === "string" ? sp.warning : null;
  const lastBroker = isBroker(sp.broker) ? sp.broker : DEFAULT_BROKER;

  let holdings: HoldingView[] = [];
  let loadError: string | null = null;
  try {
    holdings = await loadPortfolio();
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }
  const sum = (list: HoldingView[]) => list.reduce((s, h) => s + (h.value ?? 0), 0);
  const total = sum(holdings);
  // Un riquadro per broker; senza posizioni si mostra solo quello predefinito, per l'invito ad aggiungere
  const groups = BROKERS.map((broker) => ({ broker, items: holdings.filter((h) => h.broker === broker) })).filter(
    (g) => g.items.length > 0 || (holdings.length === 0 && g.broker === DEFAULT_BROKER),
  );
  const multi = groups.length > 1;

  return (
    <main className="container">
      <Nav current="/portfolio" />
      <h1 className="page-title">Portafoglio</h1>
      {multi && <p className="form-hint">Totale {eur(total)} su {groups.length} broker</p>}

      {error && <div className="notice error">{error}</div>}
      {warning && <div className="notice">{warning}</div>}
      {loadError && <div className="notice error">{loadError}</div>}

      {holdings.some((h) => (h.value ?? 0) > 0) && (
        <section className="card chart-card">
          <HoldingBars
            caption="Dove sono investiti"
            rows={holdings.map((h) => ({
              key: holdingKey(h.broker, h.id),
              label: multi ? `${h.name} (${h.broker})` : h.name,
              value: h.value ?? 0,
            }))}
          />
        </section>
      )}

      {groups.map(({ broker, items }) => (
        <section key={broker} className="card bank">
          <div className="bank-head">
            <div className="bank-name">{broker}</div>
            <div className="bank-sum">{eur(sum(items))}</div>
          </div>
          {items.length === 0 && <p className="bank-meta">Nessuna posizione. Aggiungi la prima qui sotto.</p>}
          {items.map((h) => (
            <div key={h.id} className="account">
              <div>
                <div className="account-label">{h.name}</div>
                <div className="account-iban">
                  {h.id}
                  {h.symbol && h.symbol !== h.id ? `, ${h.symbol}` : ""}, {num(h.qty)} quote
                  {h.price !== null && <> a {eur(h.price)}{h.priceSource === "manuale" ? " (manuale)" : ""}</>}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                {h.value !== null ? <div className="amount">{eur(h.value)}</div> : <div className="err">{h.error}</div>}
                <form method="post" action="/api/portfolio" style={{ display: "inline" }}>
                  <input type="hidden" name="action" value="delete" />
                  <input type="hidden" name="broker" value={h.broker} />
                  <input type="hidden" name="id" value={h.id} />
                  <button className="btn btn-ghost danger" type="submit">Elimina</button>
                </form>
              </div>
            </div>
          ))}
        </section>
      ))}

      <form className="card form-grid" method="post" action="/api/portfolio">
        <div className="form-title">Aggiungi o aggiorna posizione</div>
        <p className="form-hint">
          Per aggiornare dopo un acquisto del PAC, reinserisci lo stesso ISIN e broker con le quote totali nuove.
        </p>
        <label>
          Broker
          <select name="broker" defaultValue={lastBroker}>
            {BROKERS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </label>
        <label>
          ISIN o simbolo
          <input name="id" required placeholder="es. IE00B44Z5B48, per Bitcoin BTC-EUR" autoCapitalize="characters" />
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

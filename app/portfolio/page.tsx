import { Nav } from "@/app/nav";
import {
  ASSET_CLASSES,
  BROKERS,
  DEFAULT_BROKER,
  byAssetClass,
  byInstrument,
  isBroker,
  loadPortfolio,
  type HoldingView,
} from "@/lib/portfolio";
import { HoldingBars } from "@/app/charts";
import { ImportForm } from "./import-form";

export const dynamic = "force-dynamic";

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(n);
const num = (n: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 6 }).format(n);
const pct = (n: number) => new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 1, signDisplay: "always" }).format(n);
const signed = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always", signDisplay: "always" }).format(n);

/** Guadagno o perdita: segno e percentuale scritti, il colore li rinforza soltanto. */
function Gain({ gain, cost }: { gain: number | null; cost: number | null }) {
  if (gain === null || !cost) return null;
  return (
    <div className={`gain ${gain >= 0 ? "up" : "down"}`}>
      {signed(gain)} ({pct(gain / cost)})
    </div>
  );
}

/** Totali di un gruppo; costo e guadagno solo sulle posizioni con prezzo di carico. */
function totals(list: HoldingView[]) {
  const value = list.reduce((s, h) => s + (h.value ?? 0), 0);
  const withCost = list.filter((h) => h.cost !== null && h.value !== null);
  const cost = withCost.reduce((s, h) => s + (h.cost ?? 0), 0);
  const gain = withCost.reduce((s, h) => s + (h.gain ?? 0), 0);
  return { value, cost: withCost.length ? cost : null, gain: withCost.length ? gain : null, partial: withCost.length < list.length };
}

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
  const all = totals(holdings);
  // Un riquadro per broker; senza posizioni si mostra solo quello predefinito, per l'invito ad aggiungere
  const groups = BROKERS.map((broker) => ({ broker, items: holdings.filter((h) => h.broker === broker) })).filter(
    (g) => g.items.length > 0 || (holdings.length === 0 && g.broker === DEFAULT_BROKER),
  );
  const multi = groups.length > 1;
  const instruments = byInstrument(holdings);
  const shared = instruments.filter((i) => i.brokers.length > 1);
  const classes = byAssetClass(holdings);

  return (
    <main className="container">
      <Nav current="/portfolio" />
      <h1 className="page-title">Portafoglio</h1>

      {error && <div className="notice error">{error}</div>}
      {warning && <div className="notice">{warning}</div>}
      {loadError && <div className="notice error">{loadError}</div>}

      {holdings.length > 0 && (
        <section className="card bank">
          <div className="bank-head">
            <div>
              <div className="bank-name">Totale</div>
              <div className="bank-meta">
                {multi ? `${groups.length} broker, ` : ""}
                {holdings.length} {holdings.length === 1 ? "posizione" : "posizioni"}
                {all.cost !== null && <>, investiti {eur(all.cost)}{all.partial ? " (solo le posizioni con prezzo di carico)" : ""}</>}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="bank-sum">{eur(all.value)}</div>
              <Gain gain={all.gain} cost={all.cost} />
            </div>
          </div>
        </section>
      )}

      {instruments.some((i) => i.value > 0) && (
        <section className="card chart-card">
          <HoldingBars
            caption={multi ? "Dove sono investiti, sommando i broker" : "Dove sono investiti"}
            rows={instruments.map((i) => ({ key: i.id, label: i.name, value: i.value }))}
          />
        </section>
      )}

      {classes.length > 1 && (
        <section className="card chart-card">
          <HoldingBars caption="Per tipo di investimento" rows={classes.map((c) => ({ key: c.cls, label: c.label, value: c.value }))} />
          <p className="chart-note" style={{ margin: "12px 0 0" }}>
            Il tipo è dedotto dal nome; se è sbagliato, scegli quello giusto reinserendo la posizione.
          </p>
        </section>
      )}

      {shared.length > 0 && (
        <section className="card bank">
          <div className="bank-head">
            <div>
              <div className="bank-name">Su più broker</div>
              <div className="bank-meta">Lo stesso strumento, sommato</div>
            </div>
          </div>
          {shared.map((i) => (
            <div key={i.id} className="account">
              <div>
                <div className="account-label">{i.name}</div>
                <div className="account-iban">
                  {i.id}, {num(i.qty)} quote su {i.brokers.join(" e ")}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="amount">{eur(i.value)}</div>
                <Gain gain={i.gain} cost={i.cost} />
              </div>
            </div>
          ))}
        </section>
      )}

      {groups.map(({ broker, items }) => {
        const t = totals(items);
        return (
          <section key={broker} className="card bank">
            <div className="bank-head">
              <div className="bank-name">{broker}</div>
              <div style={{ textAlign: "right" }}>
                <div className="bank-sum">{eur(t.value)}</div>
                <Gain gain={t.gain} cost={t.cost} />
              </div>
            </div>
            {items.length === 0 && <p className="bank-meta">Nessuna posizione. Aggiungi la prima qui sotto.</p>}
            {items.map((h) => (
              <div key={h.id} className="account">
                <div>
                  <div className="account-label">{h.name}</div>
                  <div className="account-iban">
                    {h.id}
                    {h.symbol && h.symbol !== h.id ? `, ${h.symbol}` : ""}, {ASSET_CLASSES[h.cls].toLowerCase()}, {num(h.qty)} quote
                    {h.price !== null && <> a {eur(h.price)}{h.priceSource === "manuale" ? " (manuale)" : ""}</>}
                    {h.avgCost ? <>, carico {eur(h.avgCost)}</> : null}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {h.value !== null ? <div className="amount">{eur(h.value)}</div> : <div className="err">{h.error}</div>}
                  <Gain gain={h.gain} cost={h.cost} />
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
        );
      })}

      <form className="card form-grid" method="post" action="/api/portfolio">
        <div className="form-title">Aggiungi o aggiorna posizione</div>
        <p className="form-hint">
          Per aggiornare dopo un acquisto del PAC, reinserisci lo stesso ISIN e broker con le quote totali nuove.
          Le posizioni Scalable si aggiornano anche da sole ogni settimana.
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
          Prezzo medio di carico in € (facoltativo, per vedere guadagno e perdita)
          <input name="avgCost" inputMode="decimal" placeholder="es. 98,40" />
        </label>
        <label>
          Tipo
          <select name="assetClass" defaultValue="">
            <option value="">Automatico (dal nome)</option>
            {Object.entries(ASSET_CLASSES).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
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
      <ImportForm brokers={BROKERS} defaultBroker={lastBroker} />
    </main>
  );
}

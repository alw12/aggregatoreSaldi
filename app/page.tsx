import Link from "next/link";
import { headers } from "next/headers";
import { after } from "next/server";
import { psuHeadersFrom } from "@/lib/data";
import { hasStore } from "@/lib/store";
import { byAssetClass } from "@/lib/portfolio";
import { recordSnapshot, todayRome } from "@/lib/history";
import { changeSince, loadOverview, type Overview } from "@/lib/overview";
import { computeAlerts } from "@/lib/alerts";
import { QuickEdit } from "./quick-edit";
import { Nav } from "./nav";
import { AllocationBar } from "./charts";
import { TrendChart } from "./trend-chart";

export const dynamic = "force-dynamic";

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency, useGrouping: "always" }).format(amount);
}
const signed = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always", signDisplay: "always" }).format(n);

function maskIban(iban?: string) {
  return iban ? `${iban.slice(0, 4)} •••• ${iban.slice(-4)}` : undefined;
}

function when(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome",
  }).format(new Date(iso));
}

const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });

/** Il totale grande, con i centesimi in tono minore. */
function HeroAmount({ value }: { value: number }) {
  const parts = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).formatToParts(value);
  const i = parts.findIndex((p) => p.type === "decimal");
  if (i === -1) return <>{parts.map((p) => p.value).join("")}</>;
  const head = parts.slice(0, i).map((p) => p.value).join("");
  const tail = parts.slice(i).map((p) => p.value).join("");
  return (
    <>
      {head}
      <span className="cents">{tail}</span>
    </>
  );
}

/** Variazione a 7 e 30 giorni; se lo storico è più corto, dall'inizio. */
function Changes({ days }: { days: Overview["days"] }) {
  const rows: { label: string; delta: number }[] = [];
  const w = changeSince(days, 7);
  const m = changeSince(days, 30);
  if (w) rows.push({ label: "in 7 giorni", delta: w.delta });
  if (m) rows.push({ label: "in 30 giorni", delta: m.delta });
  else if (days.length >= 2) rows.push({ label: `dal ${shortDate(days[0].date)}`, delta: days.at(-1)!.total - days[0].total });
  if (!rows.length) return null;
  return (
    <div className="hero-changes">
      {rows.map((r) => (
        <span key={r.label} className={`change ${r.delta >= 0 ? "up" : "down"}`}>
          <span aria-hidden>{r.delta >= 0 ? "▲" : "▼"}</span> {signed(r.delta)} <span className="change-label">{r.label}</span>
        </span>
      ))}
    </div>
  );
}

/** Un gruppo della panoramica: chiuso mostra solo nome e totale, aperto le singole voci. */
function Group({ title, meta, sum, neg, children, foot }: { title: React.ReactNode; meta: string; sum: React.ReactNode; neg?: boolean; children: React.ReactNode; foot?: React.ReactNode }) {
  return (
    <details className="card bank group">
      <summary>
        <div>
          <div className="bank-name">{title}</div>
          <div className="bank-meta">{meta}</div>
        </div>
        <div className={`bank-sum${neg ? " neg" : ""}`}>{sum}</div>
      </summary>
      {children}
      {foot && <div className="group-foot">{foot}</div>}
    </details>
  );
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const actionError = typeof sp.error === "string" ? sp.error : null;

  if (!hasStore()) {
    return (
      <main className="container">
        <Nav current="/" />
        <div className="notice">
          Storage non configurato. Su Vercel aggiungi un database <strong>Upstash Redis</strong> dal Marketplace
          (Storage ▸ Upstash ▸ Redis) e collegalo al progetto: le variabili <code>KV_REST_API_URL</code> e{" "}
          <code>KV_REST_API_TOKEN</code> vengono impostate in automatico.
        </div>
      </main>
    );
  }

  let o: Overview;
  try {
    o = await loadOverview(psuHeadersFrom(await headers()));
  } catch (e) {
    return (
      <main className="container">
        <Nav current="/" />
        <div className="notice error">
          Il database non risponde: controlla le variabili Upstash del progetto su Vercel.
          <br />
          <small>{e instanceof Error ? e.message : String(e)}</small>
        </div>
      </main>
    );
  }

  const { banks, manual: manualAccounts, holdings, portfolioError, bonds, cards, debts, totals: t } = o;
  const classes = byAssetClass(holdings);
  const withCost = holdings.filter((h) => h.gain !== null);
  const multiBroker = new Set(holdings.map((h) => h.broker)).size > 1;
  const today = todayRome();
  const alerts = computeAlerts(o, today);

  // Una fotografia al giorno per il grafico; solo se tutto è stato letto, per non registrare buchi.
  const snap = o.today;
  if (snap) after(() => recordSnapshot(snap));
  const trend = o.days.map((s) => ({ date: s.date, value: s.total }));
  const pct = (n: number) => new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 0 }).format(n);

  return (
    <main className="container">
      <Nav current="/" />

      {actionError && <div className="notice error">{actionError}</div>}

      {o.isEmpty ? (
        <div className="card empty">
          <p>Collega una banca o aggiungi a mano un conto, un investimento o un buono.</p>
          <Link className="btn btn-primary" href="/connect">Collega la prima banca</Link>
        </div>
      ) : (
        <>
          <section className="hero" aria-labelledby="hero-label">
            <div id="hero-label" className="hero-label">Patrimonio netto</div>
            <div className="hero-value"><HeroAmount value={t.net} /></div>
            <Changes days={o.days} />
            {t.debts > 0 && (
              <div className="hero-alt">
                <span className="hero-alt-label">Senza debiti</span>
                <span className="hero-alt-value">{fmt(t.net + t.debts, "EUR")}</span>
              </div>
            )}
            {o.otherCurrencies.map(([cur, amt]) => (
              <div key={cur} className="hero-other">+ {fmt(amt, cur)}</div>
            ))}
            <AllocationBar
              parts={[
                { key: "cash", label: "Liquidità", value: t.cash, slot: 1 },
                { key: "etf", label: "ETF e crypto", value: t.holdings, slot: 2 },
                { key: "bfp", label: "Buoni postali", value: t.bonds, slot: 3 },
              ]}
            />
            {(cards.length > 0 || debts.length > 0) && (
              <div className="liabilities" aria-label="Già sottratti dal patrimonio netto">
                {cards.length > 0 && (
                  <Link href="/carte" className="liability">
                    <span className="liability-label">Carte da addebitare</span>
                    <span className={`liability-value${t.cards > 0 ? " neg" : ""}`}>{fmt(-t.cards, "EUR")}</span>
                  </Link>
                )}
                {debts.length > 0 && (
                  <Link href="/debiti" className="liability">
                    <span className="liability-label">Debiti</span>
                    <span className={`liability-value${t.debts > 0 ? " neg" : ""}`}>{fmt(-t.debts, "EUR")}</span>
                  </Link>
                )}
              </div>
            )}
            <div className="hero-sub">
              {(t.cards > 0 || t.debts > 0) && <>Il patrimonio netto è già al netto di {t.cards > 0 && t.debts > 0 ? "carte e debiti" : t.cards > 0 ? "carte" : "debiti"}. </>}
              {o.accountsCount} {o.accountsCount === 1 ? "conto" : "conti"}, letti {when(o.oldestFetch)}.
            </div>
          </section>

          {alerts.length > 0 && (
            <ul className="alerts" aria-label="Da sistemare">
              {alerts.map((a) => (
                <li key={a.key} className={`alert ${a.level}`}>
                  <Link href={a.href}>{a.text}</Link>
                </li>
              ))}
            </ul>
          )}

          <section className="card chart-card">
            <div className="chart-title">Andamento</div>
            {trend.length >= 2 ? (
              <>
                <p className="chart-note">
                  Patrimonio netto dal {shortDate(trend[0].date)}. Altri grafici in <Link href="/grafici">Grafici</Link>.
                </p>
                <TrendChart points={trend} label="Patrimonio netto" />
              </>
            ) : (
              <p className="chart-note" style={{ marginBottom: 0 }}>
                Ogni giorno viene salvato il totale: da domani qui compare la linea dell’andamento.
              </p>
            )}
          </section>

          <h2 className="section-head">Dettaglio</h2>

          {banks.map((b) => {
            const sums = new Map<string, number>();
            for (const a of b.accounts) if (a.amount !== null) sums.set(a.currency, (sums.get(a.currency) ?? 0) + a.amount);
            return (
              <Group
                key={b.sessionId}
                title={
                  <>
                    {b.bank}
                    {b.expired ? <span className="badge">consenso scaduto</span> : b.daysLeft <= 14 ? <span className="badge">scade tra {b.daysLeft} gg</span> : null}
                  </>
                }
                meta={`${b.accounts.length} ${b.accounts.length === 1 ? "conto" : "conti"}, letto ${when(b.fetchedAt)}`}
                sum={[...sums.entries()].map(([c, v]) => <div key={c}>{fmt(v, c)}</div>)}
                foot={
                  <>
                    <Link className="btn btn-ghost" href={`/banca/${b.sessionId}`}>Correggi un saldo</Link>
                    <form method="post" action="/api/eb/disconnect">
                      <input type="hidden" name="sessionId" value={b.sessionId} />
                      <button className="btn btn-ghost danger" type="submit">Scollega {b.bank}</button>
                    </form>
                  </>
                }
              >
                {b.accounts.map((a) => (
                  <div key={a.uid} className="account">
                    <div>
                      <div className="account-label">{a.label}</div>
                      {(a.iban || a.manualAt || a.staleAt) && (
                        <div className="account-iban">
                          {maskIban(a.iban)}
                          {a.manualAt && <>{a.iban ? ", " : ""}saldo manuale del {when(a.manualAt)}</>}
                          {!a.manualAt && a.staleAt && <>{a.iban ? ", " : ""}banca non raggiungibile, saldo del {when(a.staleAt)}</>}
                        </div>
                      )}
                    </div>
                    {a.amount !== null ? (
                      <div className={`amount${a.amount < 0 ? " neg" : ""}`}>{fmt(a.amount, a.currency)}</div>
                    ) : (
                      <div className="err">{a.error}</div>
                    )}
                  </div>
                ))}
              </Group>
            );
          })}

          {manualAccounts.length > 0 && (
            <Group
              title="Conti manuali"
              meta="Saldi che aggiorni tu"
              sum={fmt(manualAccounts.filter((a) => a.currency === "EUR").reduce((s, a) => s + a.amount, 0), "EUR")}
              foot={<Link className="btn btn-ghost" href="/conti">Gestisci conti</Link>}
            >
              {manualAccounts.map((a) => (
                <div key={a.id} className="account">
                  <div>
                    <div className="account-label">{a.name}</div>
                    <div className="account-iban">Aggiornato {when(a.updatedAt)}</div>
                  </div>
                  <div>
                    <div className={`amount${a.amount < 0 ? " neg" : ""}`} style={{ textAlign: "right" }}>{fmt(a.amount, a.currency)}</div>
                    <QuickEdit kind="manual" id={a.id} value={a.amount} />
                  </div>
                </div>
              ))}
            </Group>
          )}

          {(holdings.length > 0 || portfolioError) && (
            <Group
              title="Portafoglio"
              meta={
                classes.length > 1 && t.holdings > 0
                  ? classes.map((c) => `${c.label} ${pct(c.value / t.holdings)}`).join(", ")
                  : "ETF, oro e crypto a prezzi di mercato"
              }
              sum={
                <>
                  {fmt(t.holdings, "EUR")}
                  {t.holdingsGain !== null && (
                    <div className={`gain ${t.holdingsGain >= 0 ? "up" : "down"}`}>
                      {signed(t.holdingsGain)}
                      {withCost.length < holdings.length ? " (su parte)" : ""}
                    </div>
                  )}
                </>
              }
              foot={<Link className="btn btn-ghost" href="/portfolio">Apri portafoglio</Link>}
            >
              {portfolioError && <div className="err" style={{ textAlign: "left" }}>{portfolioError}</div>}
              {holdings.map((h) => (
                <div key={`${h.broker}|${h.id}`} className="account">
                  <div>
                    <div className="account-label">{h.name}</div>
                    <div className="account-iban">
                      {new Intl.NumberFormat("it-IT", { maximumFractionDigits: 6 }).format(h.qty)} quote
                      {h.price !== null && <> a {fmt(h.price, "EUR")}{h.priceSource === "manuale" ? " (manuale)" : ""}</>}
                      {multiBroker && <>, {h.broker}</>}
                    </div>
                  </div>
                  {h.value !== null ? <div className="amount">{fmt(h.value, "EUR")}</div> : <div className="err">{h.error}</div>}
                </div>
              ))}
            </Group>
          )}

          {bonds.length > 0 && (
            <Group
              title="Buoni fruttiferi postali"
              meta="Valori di rimborso netti"
              sum={fmt(t.bonds, "EUR")}
              foot={<Link className="btn btn-ghost" href="/buoni">Gestisci buoni</Link>}
            >
              {bonds.map((b) => (
                <div key={b.id} className="account">
                  <div>
                    <div className="account-label">
                      {b.name}
                      {b.matured && <span className="badge">scaduto</span>}
                    </div>
                    <div className="account-iban">
                      {fmt(b.capital, "EUR")} dal {new Date(`${b.subscribedAt}T00:00:00Z`).toLocaleDateString("it-IT", { timeZone: "UTC" })}
                      {b.valueSource === "manuale" && <>, valore del {when(b.updatedAt)}</>}
                    </div>
                    {b.valueSource !== "manuale" && (
                      <div className="account-iban estimate">
                        {b.valueSource === "stima" ? "Stima dal tasso, può essere molto diversa" : "Valore nominale, senza interessi"}: inserisci il valore di rimborso netto dall’app BancoPosta.
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="amount" style={{ textAlign: "right" }}>
                      {b.valueSource === "stima" && "≈ "}{fmt(b.value, "EUR")}
                    </div>
                    <QuickEdit kind="bond" id={b.id} value={b.valueSource === "manuale" ? b.value : null}
                      summary="Inserisci valore" placeholder="es. 2.064,00"
                      extra={b.valueSource === "manuale" && b.grossRate !== null ? { action: "estimate", label: "Usa stima" } : undefined} />
                  </div>
                </div>
              ))}
            </Group>
          )}

          {cards.length > 0 && (
            <Group
              title="Carte di credito"
              meta="Speso da addebitare"
              sum={fmt(-t.cards, "EUR")}
              neg={t.cards > 0}
              foot={<Link className="btn btn-ghost" href="/carte">Gestisci carte</Link>}
            >
              {cards.map((c) => (
                <div key={c.id} className="account">
                  <div>
                    <div className="account-label">{c.name}</div>
                    <div className="account-iban">
                      {c.last4 && <>•••• {c.last4}</>}
                      {c.nextCharge && <>{c.last4 ? ", " : ""}addebito il {shortDate(c.nextCharge)}</>}
                    </div>
                  </div>
                  <div>
                    <div className={`amount${c.balance > 0 ? " neg" : ""}`} style={{ textAlign: "right" }}>{fmt(-c.balance, "EUR")}</div>
                    <QuickEdit kind="card" id={c.id} value={c.balance} placeholder="speso, es. 432,10"
                      extra={c.balance > 0 ? { action: "zero", label: "Azzera" } : undefined} />
                  </div>
                </div>
              ))}
            </Group>
          )}
        </>
      )}
    </main>
  );
}

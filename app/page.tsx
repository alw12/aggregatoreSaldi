import Link from "next/link";
import { headers } from "next/headers";
import { after } from "next/server";
import { loadDashboard, psuHeadersFrom, type BankView } from "@/lib/data";
import { hasStore } from "@/lib/store";
import { loadPortfolio, type HoldingView } from "@/lib/portfolio";
import { loadBonds, type BondView } from "@/lib/bonds";
import { loadCards, type CreditCardView } from "@/lib/cards";
import { listManualAccounts, type ManualAccount } from "@/lib/manual";
import { loadHistory, recordSnapshot, todayRome, type Snapshot } from "@/lib/history";
import { QuickEdit } from "./quick-edit";
import { Nav } from "./nav";
import { AllocationBar, SplitChart } from "./charts";
import { TrendChart } from "./trend-chart";

export const dynamic = "force-dynamic";

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency, useGrouping: "always" }).format(amount);
}

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

function totalsByCurrency(banks: BankView[], manual: ManualAccount[]) {
  const totals = new Map<string, number>();
  for (const b of banks)
    for (const a of b.accounts)
      if (a.amount !== null) totals.set(a.currency, (totals.get(a.currency) ?? 0) + a.amount);
  for (const a of manual) totals.set(a.currency, (totals.get(a.currency) ?? 0) + a.amount);
  return [...totals.entries()].sort(([a], [b]) => (a === "EUR" ? -1 : b === "EUR" ? 1 : a.localeCompare(b)));
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

  let banks: BankView[];
  let portfolio: { holdings: HoldingView[]; error: string | null };
  let bonds: BondView[];
  let cards: CreditCardView[];
  let manualAccounts: ManualAccount[];
  let history: Snapshot[];
  try {
    const psu = psuHeadersFrom(await headers());
    [banks, portfolio, bonds, cards, manualAccounts, history] = await Promise.all([
      loadDashboard(psu),
      loadPortfolio().then(
        (holdings) => ({ holdings, error: null }),
        (e: unknown) => ({ holdings: [] as HoldingView[], error: e instanceof Error ? e.message : String(e) }),
      ),
      loadBonds(),
      loadCards(),
      listManualAccounts(),
      loadHistory().catch(() => [] as Snapshot[]),
    ]);
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

  const totals = totalsByCurrency(banks, manualAccounts);
  const accountsCount = banks.reduce((n, b) => n + b.accounts.length, 0) + manualAccounts.length;
  const failed = banks.reduce((n, b) => n + b.accounts.filter((a) => a.amount === null).length, 0);
  const { holdings, error: portfolioError } = portfolio;
  const holdingsValue = holdings.reduce((sum, h) => sum + (h.value ?? 0), 0);
  const bondsValue = bonds.reduce((sum, b) => sum + b.value, 0);
  const invested = holdingsValue + bondsValue;
  const cardsDebt = cards.reduce((sum, c) => sum + c.balance, 0);
  const cashEur = totals.find(([c]) => c === "EUR")?.[1] ?? 0;
  const otherCurrencies = totals.filter(([c]) => c !== "EUR");
  const oldest = banks.map((b) => b.fetchedAt).filter(Boolean).sort()[0] ?? null;
  const net = cashEur + invested - cardsDebt;
  const isEmpty = banks.length === 0 && holdings.length === 0 && bonds.length === 0 && cards.length === 0 && manualAccounts.length === 0;

  // Una fotografia al giorno per il grafico; solo se tutto è stato letto, per non registrare buchi.
  const today = todayRome();
  const complete = !isEmpty && failed === 0 && !portfolioError && holdings.every((h) => h.value !== null);
  if (complete) after(() => recordSnapshot({ total: net, cash: cashEur, invested, cards: cardsDebt }));
  const days: Snapshot[] = [
    ...history.filter((s) => s.date !== today),
    ...(complete ? [{ date: today, total: net, cash: cashEur, invested, cards: cardsDebt }] : history.filter((s) => s.date === today)),
  ];
  const trend = days.map((s) => ({ date: s.date, value: s.total }));
  const investedShare = days
    .filter((s) => s.cash + s.invested > 0)
    .map((s) => ({ date: s.date, value: Math.max(0, s.invested) / (Math.max(0, s.cash) + Math.max(0, s.invested)) }));

  return (
    <main className="container">
      <Nav current="/" />

      {actionError && <div className="notice error">{actionError}</div>}

      {isEmpty ? (
        <div className="card empty">
          <p>Collega una banca o aggiungi a mano un conto, un investimento o un buono.</p>
          <Link className="btn btn-primary" href="/connect">Collega la prima banca</Link>
        </div>
      ) : (
        <>
          <section className="hero" aria-labelledby="hero-label">
            <div id="hero-label" className="hero-label">Patrimonio netto</div>
            <div className="hero-value"><HeroAmount value={net} /></div>
            {otherCurrencies.map(([cur, amt]) => (
              <div key={cur} className="hero-other">+ {fmt(amt, cur)}</div>
            ))}
            <AllocationBar
              parts={[
                { key: "cash", label: "Liquidità", value: cashEur, slot: 1 },
                { key: "etf", label: "ETF e crypto", value: holdingsValue, slot: 2 },
                { key: "bfp", label: "Buoni postali", value: bondsValue, slot: 3 },
              ]}
            />
            <div className="hero-sub">
              {cardsDebt > 0 && <>Già tolti {fmt(cardsDebt, "EUR")} di carte da addebitare. </>}
              {accountsCount} {accountsCount === 1 ? "conto" : "conti"}, letti {when(oldest)}.
              {failed > 0 && (
                <span className="warn"> {failed} non {failed === 1 ? "letto, escluso" : "letti, esclusi"} dal totale.</span>
              )}
            </div>
          </section>

          {banks.some((b) => !b.expired && b.daysLeft <= 14) && (
            <div className="notice">
              Uno o più consensi scadono a breve: ricollega la banca da “Collega banca” per non perdere l’accesso.
            </div>
          )}

          {cashEur + invested > 0 && (
            <section className="card chart-card">
              <div className="chart-title">Investito e liquido</div>
              <SplitChart cash={cashEur} etf={holdingsValue} bonds={bondsValue} />
              <div className="split-sub">
                {investedShare.length >= 2 ? (
                  <>
                    <p className="chart-note">Quota investita giorno per giorno.</p>
                    <TrendChart points={investedShare} unit="pct" label="Quota investita" slot={2} />
                  </>
                ) : (
                  <p className="chart-note" style={{ marginBottom: 0 }}>
                    Da domani qui vedi anche come cambia nel tempo la quota investita.
                  </p>
                )}
              </div>
            </section>
          )}

          <section className="card chart-card">
            <div className="chart-title">Andamento</div>
            {trend.length >= 2 ? (
              <>
                <p className="chart-note">
                  Patrimonio netto dal {shortDate(trend[0].date)}. Passa sopra il grafico per il valore di ogni giorno.
                </p>
                <TrendChart points={trend} label="Patrimonio netto" />
              </>
            ) : (
              <p className="chart-note" style={{ marginBottom: 0 }}>
                Ogni giorno in cui apri Saldi viene salvato il totale: da domani qui compare la linea dell’andamento.
              </p>
            )}
          </section>

          {banks.map((b) => {
            const sums = new Map<string, number>();
            for (const a of b.accounts) if (a.amount !== null) sums.set(a.currency, (sums.get(a.currency) ?? 0) + a.amount);
            return (
              <section key={b.sessionId} className="card bank clickable">
                <Link href={`/banca/${b.sessionId}`} className="bank-link">
                  <div className="bank-head">
                    <div>
                      <div className="bank-name">
                        {b.bank}
                        {b.expired ? <span className="badge">consenso scaduto</span> : b.daysLeft <= 14 ? <span className="badge">scade tra {b.daysLeft} gg</span> : null}
                      </div>
                      <div className="bank-meta">Letto {when(b.fetchedAt)}. Tocca per correggere un saldo.</div>
                    </div>
                    <div className="bank-sum">
                      {[...sums.entries()].map(([c, v]) => <div key={c}>{fmt(v, c)}</div>)}
                    </div>
                  </div>
                  {b.accounts.map((a) => (
                    <div key={a.uid} className="account">
                      <div>
                        <div className="account-label">{a.label}</div>
                        {(a.iban || a.manualAt) && (
                          <div className="account-iban">
                            {maskIban(a.iban)}
                            {a.manualAt && <>{a.iban ? ", " : ""}saldo manuale del {when(a.manualAt)}</>}
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
                </Link>
                <form method="post" action="/api/eb/disconnect" className="group-foot">
                  <input type="hidden" name="sessionId" value={b.sessionId} />
                  <button className="btn btn-ghost danger" type="submit">Scollega {b.bank}</button>
                </form>
              </section>
            );
          })}

          {manualAccounts.length > 0 && (
            <section className="card bank">
              <div className="bank-head">
                <div>
                  <div className="bank-name">Conti manuali</div>
                  <div className="bank-meta">Saldi che aggiorni tu</div>
                </div>
              </div>
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
              <div className="group-foot">
                <Link className="btn btn-ghost" href="/conti">Gestisci conti</Link>
              </div>
            </section>
          )}

          {(holdings.length > 0 || portfolioError) && (
            <section className="card bank">
              <div className="bank-head">
                <div>
                  <div className="bank-name">Portafoglio</div>
                  <div className="bank-meta">ETF, oro e crypto a prezzi di mercato</div>
                </div>
                <div className="bank-sum">{fmt(holdingsValue, "EUR")}</div>
              </div>
              {portfolioError && <div className="err" style={{ textAlign: "left" }}>{portfolioError}</div>}
              {holdings.map((h) => (
                <div key={h.id} className="account">
                  <div>
                    <div className="account-label">{h.name}</div>
                    <div className="account-iban">
                      {new Intl.NumberFormat("it-IT", { maximumFractionDigits: 6 }).format(h.qty)} quote
                      {h.price !== null && <> a {fmt(h.price, "EUR")}{h.priceSource === "manuale" ? " (manuale)" : ""}</>}
                    </div>
                  </div>
                  {h.value !== null ? <div className="amount">{fmt(h.value, "EUR")}</div> : <div className="err">{h.error}</div>}
                </div>
              ))}
              <div className="group-foot">
                <Link className="btn btn-ghost" href="/portfolio">Apri portafoglio</Link>
              </div>
            </section>
          )}

          {bonds.length > 0 && (
            <section className="card bank">
              <div className="bank-head">
                <div>
                  <div className="bank-name">Buoni fruttiferi postali</div>
                  <div className="bank-meta">Valori netti</div>
                </div>
                <div className="bank-sum">{fmt(bondsValue, "EUR")}</div>
              </div>
              {bonds.map((b) => (
                <div key={b.id} className="account">
                  <div>
                    <div className="account-label">
                      {b.name}
                      {b.matured && <span className="badge">scaduto</span>}
                    </div>
                    <div className="account-iban">
                      {fmt(b.capital, "EUR")} dal {new Date(`${b.subscribedAt}T00:00:00Z`).toLocaleDateString("it-IT", { timeZone: "UTC" })}
                      {b.valueSource === "stima" ? ", valore stimato" : b.valueSource === "nominale" ? ", valore nominale" : ""}
                    </div>
                  </div>
                  <div className="amount">{fmt(b.value, "EUR")}</div>
                </div>
              ))}
              <div className="group-foot">
                <Link className="btn btn-ghost" href="/buoni">Gestisci buoni</Link>
              </div>
            </section>
          )}

          {cards.length > 0 && (
            <section className="card bank">
              <div className="bank-head">
                <div>
                  <div className="bank-name">Carte di credito</div>
                  <div className="bank-meta">Speso da addebitare</div>
                </div>
                <div className={`bank-sum${cardsDebt > 0 ? " neg" : ""}`}>{fmt(-cardsDebt, "EUR")}</div>
              </div>
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
              <div className="group-foot">
                <Link className="btn btn-ghost" href="/carte">Gestisci carte</Link>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

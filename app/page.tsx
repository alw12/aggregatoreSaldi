import Link from "next/link";
import { headers } from "next/headers";
import { loadDashboard, psuHeadersFrom, type BankView } from "@/lib/data";
import { hasStore } from "@/lib/store";
import { loadPortfolio, type HoldingView } from "@/lib/portfolio";
import { loadBonds, type BondView } from "@/lib/bonds";
import { loadCards, type CreditCardView } from "@/lib/cards";
import { listManualAccounts, type ManualAccount } from "@/lib/manual";
import { QuickEdit } from "./quick-edit";

export const dynamic = "force-dynamic";

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(amount);
}

function maskIban(iban?: string) {
  return iban ? `${iban.slice(0, 4)} •••• ${iban.slice(-4)}` : undefined;
}

function when(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome",
  }).format(new Date(iso));
}

function totalsByCurrency(banks: BankView[], manual: ManualAccount[]) {
  const totals = new Map<string, number>();
  for (const b of banks)
    for (const a of b.accounts)
      if (a.amount !== null) totals.set(a.currency, (totals.get(a.currency) ?? 0) + a.amount);
  for (const a of manual) totals.set(a.currency, (totals.get(a.currency) ?? 0) + a.amount);
  return [...totals.entries()].sort(([a], [b]) => (a === "EUR" ? -1 : b === "EUR" ? 1 : a.localeCompare(b)));
}

function TopBar() {
  return (
    <header className="topbar">
      <h1>Saldi</h1>
      <div className="actions">
        <form method="post" action="/api/refresh"><button className="btn" type="submit">↻ Aggiorna</button></form>
        <Link className="btn" href="/connect">+ Banca</Link>
        <Link className="btn" href="/portfolio">Portafoglio</Link>
        <Link className="btn" href="/buoni">Buoni</Link>
        <Link className="btn" href="/carte">Carte</Link>
        <Link className="btn" href="/conti">Conti</Link>
        <form method="post" action="/api/logout"><button className="btn" type="submit">Esci</button></form>
      </div>
    </header>
  );
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const actionError = typeof sp.error === "string" ? sp.error : null;
  if (!hasStore()) {
    return (
      <main className="container">
        <TopBar />
        <div className="notice">
          Storage non configurato. Su Vercel aggiungi un database <strong>Upstash Redis</strong> dal
          Marketplace (Storage → Upstash → Redis) e collegalo al progetto: le variabili
          <code> KV_REST_API_URL</code> e <code>KV_REST_API_TOKEN</code> vengono impostate in automatico.
        </div>
      </main>
    );
  }

  let banks: BankView[];
  let portfolio: { holdings: HoldingView[]; error: string | null };
  let bonds: BondView[];
  let cards: CreditCardView[];
  let manualAccounts: ManualAccount[];
  try {
    const psu = psuHeadersFrom(await headers());
    [banks, portfolio, bonds, cards, manualAccounts] = await Promise.all([
      loadDashboard(psu),
      loadPortfolio().then(
        (holdings) => ({ holdings, error: null }),
        (e: unknown) => ({ holdings: [] as HoldingView[], error: e instanceof Error ? e.message : String(e) }),
      ),
      loadBonds(),
      loadCards(),
      listManualAccounts(),
    ]);
  } catch (e) {
    return (
      <main className="container">
        <TopBar />
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

  return (
    <main className="container">
      <TopBar />

      {actionError && <div className="notice error">{actionError}</div>}

      {banks.length === 0 && holdings.length === 0 && bonds.length === 0 && cards.length === 0 && manualAccounts.length === 0 ? (
        <div className="card empty">
          <p>Nessuna banca collegata.</p>
          <Link className="btn btn-primary" href="/connect">Collega la prima banca</Link>
        </div>
      ) : (
        <>
          <section className="card total">
            <div className="label">Totale</div>
            <div className="value">{fmt(cashEur + invested - cardsDebt, "EUR")}</div>
            {otherCurrencies.map(([cur, amt]) => (
              <div key={cur} className="value">{fmt(amt, cur)}</div>
            ))}
            <div className="split">
              <div><span>Liquidità </span>{fmt(cashEur, "EUR")}</div>
              <div><span>Investimenti </span>{fmt(invested, "EUR")}</div>
              {cards.length > 0 && <div><span>Carte </span>{fmt(-cardsDebt, "EUR")}</div>}
            </div>
            <div className="sub">
              {accountsCount} conti su {banks.length} {banks.length === 1 ? "banca" : "banche"}{manualAccounts.length > 0 && " + manuali"} · aggiornato {when(oldest)}
              {failed > 0 && <> · <span style={{ color: "var(--negative)" }}>{failed} non {failed === 1 ? "letto" : "letti"}, esclus{failed === 1 ? "o" : "i"} dal totale</span></>}
            </div>
          </section>

          {banks.some((b) => !b.expired && b.daysLeft <= 14) && (
            <div className="notice">
              Uno o più consensi scadono a breve: ricollega la banca da “+ Banca” per non perdere l’accesso.
            </div>
          )}

          {(holdings.length > 0 || portfolioError) && (
            <section className="card bank">
              <div className="bank-head">
                <div>
                  <div className="bank-name">Portafoglio Trade Republic</div>
                  <div className="bank-meta">Prezzi di mercato, aggiornati ogni 15 minuti</div>
                </div>
                <div className="bank-sum">{fmt(holdingsValue, "EUR")}</div>
              </div>
              {portfolioError && <div className="err" style={{ textAlign: "left" }}>{portfolioError}</div>}
              {holdings.map((h) => (
                <div key={h.id} className="account">
                  <div>
                    <div className="account-label">{h.name}</div>
                    <div className="account-iban">
                      {new Intl.NumberFormat("it-IT", { maximumFractionDigits: 4 }).format(h.qty)} quote
                      {h.price !== null && <> × {fmt(h.price, "EUR")}{h.priceSource === "manuale" ? " (manuale)" : ""}</>}
                    </div>
                  </div>
                  {h.value !== null ? (
                    <div className="amount">{fmt(h.value, "EUR")}</div>
                  ) : (
                    <div className="err">{h.error}</div>
                  )}
                </div>
              ))}
              <div style={{ textAlign: "right", marginTop: 8 }}>
                <Link className="btn btn-ghost" href="/portfolio">Modifica</Link>
              </div>
            </section>
          )}

          {bonds.length > 0 && (
            <section className="card bank">
              <div className="bank-head">
                <div>
                  <div className="bank-name">Buoni fruttiferi postali</div>
                  <div className="bank-meta">Valori netti, inseriti a mano o stimati dal tasso</div>
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
                      {fmt(b.capital, "EUR")} sottoscritti il {new Date(`${b.subscribedAt}T00:00:00Z`).toLocaleDateString("it-IT", { timeZone: "UTC" })}
                      {b.valueSource === "stima" ? " (stima)" : b.valueSource === "nominale" ? " (nominale)" : ""}
                    </div>
                  </div>
                  <div className="amount">{fmt(b.value, "EUR")}</div>
                </div>
              ))}
              <div style={{ textAlign: "right", marginTop: 8 }}>
                <Link className="btn btn-ghost" href="/buoni">Modifica</Link>
              </div>
            </section>
          )}

          {cards.length > 0 && (
            <section className="card bank">
              <div className="bank-head">
                <div>
                  <div className="bank-name">Carte di credito</div>
                  <div className="bank-meta">Speso da addebitare, inserito a mano</div>
                </div>
                <div className={`bank-sum${cardsDebt > 0 ? " neg" : ""}`}>{fmt(-cardsDebt, "EUR")}</div>
              </div>
              {cards.map((c) => (
                <div key={c.id} className="account">
                  <div>
                    <div className="account-label">{c.name}</div>
                    <div className="account-iban">
                      {c.last4 && <>•••• {c.last4}</>}
                      {c.nextCharge && <>{c.last4 ? " · " : ""}addebito il {new Date(`${c.nextCharge}T00:00:00Z`).toLocaleDateString("it-IT", { timeZone: "UTC" })}</>}
                    </div>
                  </div>
                  <div>
                    <div className={`amount${c.balance > 0 ? " neg" : ""}`} style={{ textAlign: "right" }}>{fmt(-c.balance, "EUR")}</div>
                    <QuickEdit kind="card" id={c.id} value={c.balance} placeholder="speso, es. 432,10"
                      extra={c.balance > 0 ? { action: "zero", label: "Azzera" } : undefined} />
                  </div>
                </div>
              ))}
              <div style={{ textAlign: "right", marginTop: 8 }}>
                <Link className="btn btn-ghost" href="/carte">Modifica</Link>
              </div>
            </section>
          )}

          {manualAccounts.length > 0 && (
            <section className="card bank">
              <div className="bank-head">
                <div>
                  <div className="bank-name">Conti manuali</div>
                  <div className="bank-meta">Saldi inseriti a mano</div>
                </div>
              </div>
              {manualAccounts.map((a) => (
                <div key={a.id} className="account">
                  <div>
                    <div className="account-label">{a.name}</div>
                    <div className="account-iban">aggiornato {when(a.updatedAt)}</div>
                  </div>
                  <div>
                    <div className={`amount${a.amount < 0 ? " neg" : ""}`} style={{ textAlign: "right" }}>{fmt(a.amount, a.currency)}</div>
                    <QuickEdit kind="manual" id={a.id} value={a.amount} />
                  </div>
                </div>
              ))}
              <div style={{ textAlign: "right", marginTop: 8 }}>
                <Link className="btn btn-ghost" href="/conti">Modifica</Link>
              </div>
            </section>
          )}

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
                      {b.expired ? <span className="badge">scaduto</span> : b.daysLeft <= 14 ? <span className="badge">scade tra {b.daysLeft} gg</span> : null}
                    </div>
                    <div className="bank-meta">
                      Consenso fino al {new Date(b.validUntil).toLocaleDateString("it-IT")} · letto {when(b.fetchedAt)} · tocca per modificare
                    </div>
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
                          {a.manualAt && <>{a.iban ? " · " : ""}manuale {when(a.manualAt)}</>}
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

                <form method="post" action="/api/eb/disconnect" style={{ textAlign: "right", marginTop: 8 }}>
                  <input type="hidden" name="sessionId" value={b.sessionId} />
                  <button className="btn btn-ghost" type="submit">Scollega</button>
                </form>
              </section>
            );
          })}
        </>
      )}
    </main>
  );
}

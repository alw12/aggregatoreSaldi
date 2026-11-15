import Link from "next/link";
import { headers } from "next/headers";
import { Nav } from "@/app/nav";
import { psuHeadersFrom } from "@/lib/data";
import { hasStore, listSessions } from "@/lib/store";
import { loadMovements } from "@/lib/transactions";
import { listDebts, type Debt } from "@/lib/debts";
import { getBudget } from "@/lib/budget-store";
import { todayRome } from "@/lib/history";
import { CATEGORIES, type CategoryKey } from "@/lib/categories";
import { payoff } from "@/lib/finance";
import type { Movement } from "@/lib/flows";
import {
  EMPTY_BUDGET,
  addMonths,
  budgetLines,
  daysInMonth,
  forecastMonth,
  goalHistory,
  recurringDue,
  recurringSpending,
  usualByCategory,
  BUDGET_WARN,
  displayParty,
  type BudgetSettings,
} from "@/lib/budget";

export const dynamic = "force-dynamic";

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(n);
const eur0 = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(n);
const monthName = (ym: string, year = true) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("it-IT", { month: "long", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });
const it = (n: number) => String(n).replace(".", ",");

// Le rate hanno già il loro piano in Debiti: niente tetto
const LIMITABLE = (Object.keys(CATEGORIES) as CategoryKey[]).filter((k) => k !== "rate");

/** Questo mese, budget per categoria, obiettivo di risparmio, spese ricorrenti e fine dei debiti. */
export default async function BudgetPage({ searchParams }: PageProps<"/budget">) {
  const sp = await searchParams;
  const formError = typeof sp.error === "string" ? sp.error : null;
  const saved = sp.ok === "1";

  let moves: Movement[] = [];
  let debts: Debt[] = [];
  let budget: BudgetSettings = EMPTY_BUDGET;
  let hasBanks = false;
  let error: string | null = null;
  if (hasStore()) {
    try {
      hasBanks = (await listSessions()).length > 0;
      // Prima i movimenti: scalano le rate passate, poi i debiti sono aggiornati
      if (hasBanks) moves = (await loadMovements(psuHeadersFrom(await headers()))).moves;
      [debts, budget] = await Promise.all([listDebts(), getBudget()]);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  const today = todayRome();
  const month = today.slice(0, 7);
  const installments = debts.flatMap((d) => (d.installment ? [d.installment] : []));
  const f = forecastMonth(moves, today);
  const rec = recurringSpending(moves, today, installments);
  const due = recurringDue(rec, today);
  const dueTotal = due.reduce((s, r) => s + r.amount, 0);
  const recTotal = rec.reduce((s, r) => s + r.amount, 0);
  const lines = budgetLines(moves, budget.limits, today, installments);
  const usual = usualByCategory(moves, today, installments);
  const goal = budget.goal;
  const history = goal ? goalHistory(moves, goal, today) : [];
  const pace = (Number(today.slice(8, 10)) / daysInMonth(month)) * 100;
  const available = goal !== null ? f.income.expected - goal - f.spending.sofar - dueTotal : null;
  const loans = debts
    .filter((d) => d.installment && d.amount > 0)
    .map((d) => ({ d, plan: payoff(d.amount, d.installment!, d.rate ?? 0) }));
  const hasMoves = moves.length > 0;

  return (
    <main className="container">
      <Nav current="/budget" />
      <h1 className="page-title">Budget</h1>
      <p className="page-lead">Come finisce il mese, quanto puoi ancora spendere e quali spese tornano ogni mese.</p>

      {error && <div className="notice error">{error}</div>}
      {formError && <div className="notice error">{formError}</div>}
      {saved && <div className="notice ok">Salvato.</div>}
      {!hasBanks && !error && (
        <div className="card empty">
          <p>Il budget si calcola dai movimenti delle banche collegate.</p>
          <Link className="btn btn-primary" href="/connect">Collega una banca</Link>
        </div>
      )}

      {hasMoves && (
        <section className="card chart-card">
          <div className="chart-title" style={{ textTransform: "capitalize" }}>{monthName(month)}</div>
          <p className="chart-note">
            {f.basis
              ? `Previsione dai ${f.basis === 1 ? "movimenti dell’ultimo mese intero" : `ultimi ${f.basis} mesi interi`}: le spese che di solito arrivano dopo oggi contano al loro posto.`
              : "Serve almeno un mese intero di movimenti per la previsione: per ora vedi solo quanto hai speso."}
          </p>
          <div className="tiles">
            <div className="tile">
              <span className="tile-label">Speso finora</span>
              <span className="tile-value">{eur0(f.spending.sofar)}</span>
              <span className="tile-sub">entrate finora {eur0(f.income.sofar)}</span>
            </div>
            {f.basis > 0 && (
              <div className="tile">
                <span className="tile-label">Uscite a fine mese</span>
                <span className="tile-value">{eur0(f.spending.expected)}</span>
                <span className="tile-sub">previste, con entrate di {eur0(f.income.expected)}</span>
              </div>
            )}
            {f.basis > 0 && (
              <div className="tile">
                <span className="tile-label">Risparmio previsto</span>
                <span className={`tile-value${f.saved < 0 ? " neg" : ""}`}>{eur0(f.saved)}</span>
                <span className="tile-sub">
                  {goal === null ? "nessun obiettivo impostato" : f.saved >= goal ? `✓ obiettivo di ${eur0(goal)} raggiunto` : `${eur0(goal - f.saved)} sotto l’obiettivo`}
                </span>
              </div>
            )}
          </div>
          {available !== null && f.basis > 0 && (
            <p className="chart-note budget-left">
              {available > 0 ? (
                <>
                  Per mettere da parte {eur0(goal!)} puoi spendere ancora <strong>{eur0(available)}</strong> fino a fine mese, circa{" "}
                  <strong>{eur0(available / f.daysLeft)} al giorno</strong> per {f.daysLeft} {f.daysLeft === 1 ? "giorno" : "giorni"}.
                </>
              ) : (
                <>
                  Questo mese l’obiettivo di {eur0(goal!)} non si raggiunge: anche senza altre spese ti mancano <strong>{eur0(-available)}</strong>.
                </>
              )}
              {due.length > 0 && <> Ho già tolto le spese fisse che devono ancora passare ({eur0(dueTotal)}).</>}
            </p>
          )}
          {due.length > 0 && (
            <div className="due-list">
              <div className="due-head">Devono ancora passare questo mese</div>
              {due.map((r) => (
                <div key={r.key} className="due">
                  <span className="due-date">{shortDate(r.next)}</span>
                  <span className="tx-party">{displayParty(r.party)}</span>
                  <span className="due-amt">{eur(r.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {hasMoves && (
        <section className="card chart-card" id="categorie">
          <div className="chart-title">Budget per categoria</div>
          {lines.length === 0 ? (
            <p className="chart-note" style={{ marginBottom: 0 }}>
              Nessun budget impostato. Scegli un tetto al mese per le categorie che vuoi tenere d’occhio{" "}
              <a href="#imposta">qui sotto</a>: ti avviso all’80% e quando lo superi.
            </p>
          ) : (
            <>
              <p className="chart-note">La tacca è dove saresti spendendo in modo uniforme fino a oggi. Avviso all’80% e quando superi il tetto.</p>
              <div className="blines">
                {lines.map((b) => {
                  const ratio = b.spent / b.limit;
                  const state = ratio >= 1 ? "over" : ratio >= BUDGET_WARN ? "warn" : "ok";
                  return (
                    <div key={b.key} className={`bline ${state}`}>
                      <div className="bline-head">
                        <span className={`swatch c${b.color}`} aria-hidden />
                        <span className="bline-label">{b.label}</span>
                        <span className="bline-figs">
                          <strong>{eur0(b.spent)}</strong> di {eur0(b.limit)}
                        </span>
                      </div>
                      <div className="bline-track" title={`${b.label}: ${eur(b.spent)} di ${eur(b.limit)}`}>
                        <span className={`bline-fill c${b.color}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                        <span className="bline-pace" style={{ left: `${pace}%` }} aria-hidden />
                      </div>
                      <div className="bline-sub">
                        {state === "over" ? (
                          <span className="bline-state">⚠ Superato di {eur0(b.spent - b.limit)}</span>
                        ) : (
                          <span className={state === "warn" ? "bline-state" : undefined}>
                            {state === "warn" ? "⚠ " : ""}Restano {eur0(b.limit - b.spent)}
                          </span>
                        )}
                        {b.usual !== null && <span>di solito {eur0(b.usual)} al mese</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}

      {hasMoves && (
        <section className="card chart-card">
          <div className="chart-title">Obiettivo di risparmio</div>
          {goal === null ? (
            <p className="chart-note" style={{ marginBottom: 0 }}>
              Scegli quanto vuoi mettere da parte ogni mese <a href="#imposta">qui sotto</a>: vedi se sei in linea e quanto puoi ancora spendere.
            </p>
          ) : history.length === 0 ? (
            <p className="chart-note" style={{ marginBottom: 0 }}>Obiettivo: {eur0(goal)} al mese. Lo storico compare dopo il primo mese intero di movimenti.</p>
          ) : (
            <>
              <p className="chart-note">
                {eur0(goal)} al mese: entrate meno uscite, come in <Link href="/movimenti">Movimenti</Link>. Raggiunto {history.filter((h) => h.reached).length} volte su {history.length}.
              </p>
              <div className="goals">
                {(() => {
                  const max = Math.max(goal, ...history.map((h) => h.saved)) * 1.08;
                  return history
                    .slice()
                    .reverse()
                    .map((h) => (
                      <div key={h.month} className={`goal-row${h.reached ? " hit" : ""}`}>
                        <span className="goal-month">{monthName(h.month)}</span>
                        <span className="goal-track" title={`${monthName(h.month)}: ${eur(h.saved)}`}>
                          <span className="goal-fill" style={{ width: `${Math.max(0, (h.saved / max) * 100)}%` }} />
                          <span className="goal-mark" style={{ left: `${(goal / max) * 100}%` }} aria-hidden />
                        </span>
                        <span className={`goal-value${h.saved < 0 ? " neg" : ""}`}>{eur0(h.saved)}</span>
                        <span className="goal-state">{h.reached ? "✓ raggiunto" : `mancano ${eur0(goal - h.saved)}`}</span>
                      </div>
                    ));
                })()}
              </div>
            </>
          )}
        </section>
      )}

      {hasMoves && (
        <section className="card chart-card">
          <div className="chart-title">Spese ricorrenti</div>
          {rec.length === 0 ? (
            <p className="chart-note" style={{ marginBottom: 0 }}>Nessuna spesa che torna ogni mese con lo stesso importo, per ora.</p>
          ) : (
            <>
              <p className="chart-note">
                Stessa controparte e importo simile ogni mese: <strong>{eur0(recTotal)} al mese</strong>, {eur0(recTotal * 12)} l’anno. Riconosciute dopo almeno due
                mesi; quelle annuali non le vedo.
              </p>
              <div className="tx-list rec-list">
                {rec.map((r) => (
                  <div key={r.key} className="rec">
                    <span className={`swatch c${CATEGORIES[r.category].color}`} aria-hidden />
                    <span className="rec-main">
                      <span className="tx-party" title={r.party}>{displayParty(r.party)}</span>
                      <span className="rec-meta">
                        {CATEGORIES[r.category].label} · {r.months} mesi · {r.next.slice(0, 7) === month && r.last.slice(0, 7) !== month ? "prossimo" : "poi"} il {shortDate(r.next)}
                      </span>
                    </span>
                    <span className="due-amt">{eur(r.amount)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {loans.length > 0 && (
        <section className="card chart-card">
          <div className="chart-title">Fine dei debiti</div>
          <p className="chart-note">
            Con la rata di adesso{loans.some((l) => l.d.rate == null) ? "; senza TAEG conto solo il capitale" : ""}. Dettagli e rimborso anticipato in{" "}
            <Link href="/debiti">Debiti</Link>.
          </p>
          <div className="tiles">
            {loans.map(({ d, plan }) => (
              <div key={d.id} className="tile">
                <span className="tile-label">{d.name}</span>
                <span className="tile-value loan-figure" style={{ textTransform: "capitalize" }}>
                  {plan ? monthName(addMonths(month, plan.months)) : "—"}
                </span>
                <span className="tile-sub">
                  {plan ? `ultima rata; poi ${eur0(d.installment!)} al mese in più` : "con questa rata il debito non scende"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {(hasBanks || goal !== null || lines.length > 0) && (
        <form className="card form-grid" id="imposta" method="post" action="/api/budget">
          <div className="form-title">Obiettivo e budget</div>
          <label>
            Risparmio al mese in €
            <input name="goal" inputMode="decimal" placeholder="es. 300" defaultValue={goal ? it(goal) : undefined} />
          </label>
          <p className="form-hint">Entrate meno uscite. Lascia vuoto per non avere un obiettivo.</p>
          <div className="form-title" style={{ fontSize: 15, marginTop: 6 }}>Tetto al mese per categoria</div>
          <p className="form-hint">Vuoto = nessun tetto. Accanto vedi quanto spendi di solito.</p>
          <div className="limit-grid">
            {LIMITABLE.map((k) => {
              const u = usual.get(k);
              return (
                <label key={k}>
                  <span className="limit-label">
                    <span className={`swatch c${CATEGORIES[k].color}`} aria-hidden />
                    {CATEGORIES[k].label}
                    {u ? <span className="limit-usual">di solito {eur0(u)}</span> : null}
                  </span>
                  <input name={`limit_${k}`} inputMode="decimal" placeholder={u ? String(Math.round(u / 10) * 10) : "—"} defaultValue={budget.limits[k] ? it(budget.limits[k]!) : undefined} />
                </label>
              );
            })}
          </div>
          <button className="btn btn-primary" type="submit">Salva</button>
        </form>
      )}
    </main>
  );
}

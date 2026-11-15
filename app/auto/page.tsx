import Link from "next/link";
import { headers } from "next/headers";
import { Nav } from "@/app/nav";
import { psuHeadersFrom } from "@/lib/data";
import { hasStore, listSessions } from "@/lib/store";
import { loadMovements } from "@/lib/transactions";
import { listDebts, type Debt } from "@/lib/debts";
import { listCatRules } from "@/lib/cat-store";
import { getCarSettings } from "@/lib/car-store";
import { EMPTY_CAR, carCost, guessCarLoan, type CarSettings } from "@/lib/car";
import { addMonths } from "@/lib/budget";
import { payoff } from "@/lib/finance";
import { displayParty } from "@/lib/party";
import { todayRome } from "@/lib/history";
import type { CatRules } from "@/lib/categories";
import type { Movement } from "@/lib/flows";

export const dynamic = "force-dynamic";

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(n);
const eur0 = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(n);
const pct = (n: number) => new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 0 }).format(n);
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });
const monthName = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("it-IT", { month: "long", year: "numeric", timeZone: "UTC" });
const it = (n: number) => String(n).replace(".", ",");

const SOURCE = { movimenti: "media dai movimenti", debito: "rata del debito", annuale: "annuale ÷ 12" } as const;

/** Quanto costa l'auto al mese, voce per voce. */
export default async function CarPage({ searchParams }: PageProps<"/auto">) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const ok = sp.ok === "1";

  let moves: Movement[] = [];
  let debts: Debt[] = [];
  let rules: CatRules = {};
  let saved: CarSettings | null = null;
  let loadError: string | null = null;
  if (hasStore()) {
    try {
      if ((await listSessions()).length) moves = (await loadMovements(psuHeadersFrom(await headers()))).moves;
      [debts, rules, saved] = await Promise.all([listDebts(), listCatRules().catch(() => ({})), getCarSettings()]);
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
  }
  const today = todayRome();
  const settings: CarSettings = saved ?? { ...EMPTY_CAR, loanId: guessCarLoan(debts)?.id ?? null };
  const loanDebt = debts.find((d) => d.id === settings.loanId && d.installment) ?? null;
  const c = carCost(moves, today, settings, loanDebt ? { installment: loanDebt.installment!, amount: loanDebt.amount } : null, rules);
  const plan = loanDebt && loanDebt.amount > 0 ? payoff(loanDebt.amount, loanDebt.installment!, loanDebt.rate ?? 0) : null;
  const max = Math.max(...c.lines.map((l) => l.monthly), 0);
  const missing = (["assicurazione", "bollo"] as const).filter((p) => !settings.annual[p] && !c.lines.some((l) => l.part === p));

  return (
    <main className="container">
      <Nav current="/auto" />
      <h1 className="page-title">Auto</h1>
      <p className="page-lead">Quanto ti costa davvero al mese: rata, carburante, pedaggi, manutenzione, assicurazione e bollo.</p>

      {loadError && <div className="notice error">{loadError}</div>}
      {error && <div className="notice error">{error}</div>}
      {ok && <div className="notice ok">Salvato.</div>}

      {c.lines.length === 0 ? (
        <div className="card empty">
          <p>Nessuna spesa per l’auto trovata nei movimenti. Scegli il debito della rata e scrivi le spese annuali qui sotto.</p>
        </div>
      ) : (
        <>
          <section className="inv-hero">
            <div className="hero-label">L’auto ti costa</div>
            <div className="inv-total amount">
              {eur0(c.monthly)} <span className="car-per">al mese</span>
            </div>
            <div className="inv-gain inv-muted">
              {eur0(c.yearly)} l’anno{c.perKm !== null && <> · {eur(c.perKm)} al km</>} · questo mese finora {eur0(c.thisMonth)}
            </div>
          </section>

          <section className="card chart-card">
            <div className="chart-title">Voce per voce</div>
            <p className="chart-note">
              {c.basis ? `Medie degli ultimi ${c.basis === 1 ? "mese intero" : `${c.basis} mesi interi`}. ` : ""}Tocca una voce per vedere i movimenti.
            </p>
            <div className="car-lines">
              {c.lines.map((l) => (
                <details key={l.part} className="car-line">
                  <summary>
                    <span className={`swatch c${l.color}`} aria-hidden />
                    <span className="car-label">
                      {l.label}
                      <span className="rec-meta">{SOURCE[l.source]}</span>
                    </span>
                    <span className="car-bar" aria-hidden>
                      <span className={`c${l.color}`} style={{ width: `${max ? Math.max(2, (l.monthly / max) * 100) : 0}%` }} />
                    </span>
                    <span className="car-figs">
                      <span className="amount">{eur0(l.monthly)}</span>
                      <span className="inv-muted inv-small">{pct(l.monthly / c.monthly)}</span>
                    </span>
                  </summary>
                  <div className="pie-detail">
                    {l.moves.length === 0 ? (
                      <p className="chart-note" style={{ margin: "6px 0" }}>
                        {l.source === "annuale" ? "Importo annuale scritto qui sotto." : "Nessun movimento negli ultimi mesi."}
                      </p>
                    ) : (
                      <div className="tx-list">
                        {l.moves.slice(0, 20).map((m) => (
                          <div key={m.id} className="tx">
                            <span className="tx-party">{displayParty(m.party)}</span>
                            <span className="tx-meta">{shortDate(m.date)}, {m.account}</span>
                            <span className="tx-amount">{eur(m.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {l.source === "annuale" && l.moves.length > 0 && (
                      <p className="chart-note" style={{ margin: "6px 0" }}>Questi movimenti non contano: vale l’importo annuale scritto qui sotto.</p>
                    )}
                  </div>
                </details>
              ))}
            </div>
            {missing.length > 0 && (
              <p className="chart-note budget-left">
                {missing.length === 1 ? `Manca ${missing[0] === "bollo" ? "il bollo" : "l’assicurazione"}` : "Mancano assicurazione e bollo"}: si pagano una volta l’anno e la banca mostra solo gli ultimi mesi. Scrivili qui sotto per il costo vero.
              </p>
            )}
          </section>

          {plan && plan.months > 0 && (
            <section className="card chart-card">
              <div className="chart-title">Dopo l’ultima rata</div>
              <p className="chart-note" style={{ marginBottom: 0 }}>
                L’ultima rata è a <strong style={{ textTransform: "capitalize" }}>{monthName(addMonths(today.slice(0, 7), plan.months))}</strong>: da lì l’auto costa circa{" "}
                <strong>{eur0(c.withoutLoan)} al mese</strong>, {eur0(c.monthly - c.withoutLoan)} in meno. Dettagli in <Link href="/debiti">Debiti</Link>.
              </p>
            </section>
          )}
        </>
      )}

      <form className="card form-grid" method="post" action="/api/auto">
        <div className="form-title">Impostazioni</div>
        <label>
          Debito della rata
          <select name="loanId" defaultValue={settings.loanId ?? ""}>
            <option value="">Nessuna rata</option>
            {debts
              .filter((d) => d.installment)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({eur(d.installment!)} al mese)
                </option>
              ))}
          </select>
        </label>
        {!saved && settings.loanId && <p className="form-hint">Scelto dal nome del debito: salva per confermare.</p>}
        <div className="limit-grid">
          <label>
            Assicurazione all’anno in €
            <input name="assicurazione" inputMode="decimal" placeholder="es. 650" defaultValue={settings.annual.assicurazione ? it(settings.annual.assicurazione) : undefined} />
          </label>
          <label>
            Bollo all’anno in €
            <input name="bollo" inputMode="decimal" placeholder="es. 180" defaultValue={settings.annual.bollo ? it(settings.annual.bollo) : undefined} />
          </label>
          <label>
            Manutenzione all’anno in € (facoltativa)
            <input name="manutenzione" inputMode="decimal" placeholder="tagliando, gomme…" defaultValue={settings.annual.manutenzione ? it(settings.annual.manutenzione) : undefined} />
          </label>
          <label>
            Km all’anno (facoltativi)
            <input name="km" inputMode="numeric" placeholder="es. 15.000" defaultValue={settings.kmYear ? String(settings.kmYear) : undefined} />
          </label>
        </div>
        <p className="form-hint">Le spese annuali scritte qui sostituiscono i movimenti della stessa voce, così non contano due volte.</p>
        <button className="btn btn-primary" type="submit">Salva</button>
      </form>
    </main>
  );
}

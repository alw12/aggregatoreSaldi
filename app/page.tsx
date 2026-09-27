import Link from "next/link";
import { headers } from "next/headers";
import { loadDashboard, psuHeadersFrom, type BankView } from "@/lib/data";
import { hasStore } from "@/lib/store";

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

function totalsByCurrency(banks: BankView[]) {
  const totals = new Map<string, number>();
  for (const b of banks)
    for (const a of b.accounts)
      if (a.amount !== null) totals.set(a.currency, (totals.get(a.currency) ?? 0) + a.amount);
  return [...totals.entries()].sort(([a], [b]) => (a === "EUR" ? -1 : b === "EUR" ? 1 : a.localeCompare(b)));
}

function TopBar() {
  return (
    <header className="topbar">
      <h1>Saldi</h1>
      <div className="actions">
        <form method="post" action="/api/refresh"><button className="btn" type="submit">↻ Aggiorna</button></form>
        <Link className="btn" href="/connect">+ Banca</Link>
        <form method="post" action="/api/logout"><button className="btn" type="submit">Esci</button></form>
      </div>
    </header>
  );
}

export default async function Home() {
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
  try {
    banks = await loadDashboard(psuHeadersFrom(await headers()));
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
  const totals = totalsByCurrency(banks);
  const accountsCount = banks.reduce((n, b) => n + b.accounts.length, 0);
  const failed = banks.reduce((n, b) => n + b.accounts.filter((a) => a.amount === null).length, 0);
  const oldest = banks.map((b) => b.fetchedAt).filter(Boolean).sort()[0] ?? null;

  return (
    <main className="container">
      <TopBar />

      {banks.length === 0 ? (
        <div className="card empty">
          <p>Nessuna banca collegata.</p>
          <Link className="btn btn-primary" href="/connect">Collega la prima banca</Link>
        </div>
      ) : (
        <>
          <section className="card total">
            <div className="label">Totale</div>
            {totals.length === 0 ? (
              <div className="value">—</div>
            ) : (
              totals.map(([cur, amt]) => (
                <div key={cur} className="value">{fmt(amt, cur)}</div>
              ))
            )}
            <div className="sub">
              {accountsCount} conti su {banks.length} {banks.length === 1 ? "banca" : "banche"} · aggiornato {when(oldest)}
              {failed > 0 && <> · <span style={{ color: "var(--negative)" }}>{failed} non {failed === 1 ? "letto" : "letti"}, esclus{failed === 1 ? "o" : "i"} dal totale</span></>}
            </div>
          </section>

          {banks.some((b) => !b.expired && b.daysLeft <= 14) && (
            <div className="notice">
              Uno o più consensi scadono a breve: ricollega la banca da “+ Banca” per non perdere l’accesso.
            </div>
          )}

          {banks.map((b) => {
            const sums = new Map<string, number>();
            for (const a of b.accounts) if (a.amount !== null) sums.set(a.currency, (sums.get(a.currency) ?? 0) + a.amount);
            return (
              <section key={b.sessionId} className="card bank">
                <div className="bank-head">
                  <div>
                    <div className="bank-name">
                      {b.bank}
                      {b.expired ? <span className="badge">scaduto</span> : b.daysLeft <= 14 ? <span className="badge">scade tra {b.daysLeft} gg</span> : null}
                    </div>
                    <div className="bank-meta">
                      Consenso fino al {new Date(b.validUntil).toLocaleDateString("it-IT")} · letto {when(b.fetchedAt)}
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
                      {a.iban && <div className="account-iban">{maskIban(a.iban)}</div>}
                    </div>
                    {a.amount !== null ? (
                      <div className={`amount${a.amount < 0 ? " neg" : ""}`}>{fmt(a.amount, a.currency)}</div>
                    ) : (
                      <div className="err">{a.error}</div>
                    )}
                  </div>
                ))}

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

import { Nav } from "@/app/nav";
import { AutoRefresh } from "@/app/auto-refresh";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { loadDashboard, psuHeadersFrom } from "@/lib/data";

export const dynamic = "force-dynamic";

const fmt = (n: number, currency: string) => new Intl.NumberFormat("it-IT", { style: "currency", currency, useGrouping: "always" }).format(n);
const when = (iso: string) =>
  new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }).format(new Date(iso));
const maskIban = (iban?: string) => (iban ? `${iban.slice(0, 4)} •••• ${iban.slice(-4)}` : undefined);

/** Modifica manuale dei saldi dei conti di una banca collegata. */
export default async function BankPage(props: PageProps<"/banca/[sessionId]">) {
  const { sessionId } = await props.params;
  const sp = await props.searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;

  const banks = await loadDashboard(psuHeadersFrom(await headers()));
  const bank = banks.find((b) => b.sessionId === sessionId);
  if (!bank) notFound();
  const self = `/banca/${bank.sessionId}`;

  return (
    <main className="container">
      <Nav current="/" />
      <AutoRefresh pending={!!bank.refreshing} />
      <h1 className="page-title">{bank.bank}</h1>

      {error && <div className="notice error">{error}</div>}

      <p className="bank-meta" style={{ margin: "0 0 16px" }}>
        Il saldo che inserisci sostituisce quello letto dalla banca finché non premi “Usa saldo della banca”.
      </p>

      {bank.accounts.map((a) => (
        <form key={a.uid} className="card form-grid bank" method="post" action="/api/balances">
          <input type="hidden" name="kind" value="account" />
          <input type="hidden" name="id" value={a.uid} />
          <input type="hidden" name="next" value={self} />
          <div className="bank-head" style={{ marginBottom: 0 }}>
            <div>
              <div className="bank-name">{a.label}</div>
              <div className="bank-meta">
                {maskIban(a.iban)}
                {a.manualAt ? (
                  <>{a.iban ? ", " : ""}saldo manuale dal {when(a.manualAt)}</>
                ) : a.staleAt ? (
                  <>{a.iban ? ", " : ""}banca non raggiungibile, saldo del {when(a.staleAt)}</>
                ) : a.error ? (
                  <>{a.iban ? ", " : ""}{a.error}</>
                ) : null}
              </div>
            </div>
            {a.amount !== null && (
              <div className={`bank-sum${a.amount < 0 ? " neg" : ""}`}>{fmt(a.amount, a.currency)}</div>
            )}
          </div>
          <label>
            Nuovo saldo in {a.currency}
            <input
              name="amount"
              required
              inputMode="decimal"
              placeholder="es. 1.234,56"
              defaultValue={a.amount !== null ? String(Math.round(a.amount * 100) / 100).replace(".", ",") : undefined}
            />
          </label>
          <button className="btn btn-primary" type="submit" name="action" value="set">Salva</button>
          {a.manualAt && (
            <button className="btn" type="submit" name="action" value="clear" formNoValidate>Usa saldo della banca</button>
          )}
        </form>
      ))}
    </main>
  );
}

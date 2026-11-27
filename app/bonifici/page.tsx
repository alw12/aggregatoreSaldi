import Link from "next/link";
import { cookies, headers } from "next/headers";
import { Nav } from "@/app/nav";
import { AUTH_COOKIE, authRole } from "@/lib/auth";
import { loadDashboard, psuHeadersFrom, type AccountView, type BankView } from "@/lib/data";
import { getPayment as fetchPayment } from "@/lib/eb";
import { listPayments, recentBeneficiaries, savePayment, type StoredPayment } from "@/lib/payment-store";
import { bankSupport, describeStatus, formatIban, maskIban, MAX_NAME, MAX_REFERENCE, type BankSupport } from "@/lib/payments";
import { pisCoverage, type PisCoverage } from "@/lib/pis";
import { hasStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const fmt = (n: number, currency = "EUR") => new Intl.NumberFormat("it-IT", { style: "currency", currency, useGrouping: "always" }).format(n);
const when = (iso: string) =>
  new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }).format(new Date(iso));
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

type Source = { bank: BankView; account: AccountView };

/** Rilegge dalla banca lo stato dei bonifici non ancora definitivi degli ultimi 7 giorni (al massimo 5). */
async function refreshStatuses(payments: StoredPayment[]): Promise<StoredPayment[]> {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const open = payments.filter((p) => p.paymentId && !p.final && p.status !== "error" && p.createdAt > weekAgo).slice(0, 5);
  const fresh = await Promise.all(
    open.map(async (p) => {
      try {
        const info = await fetchPayment(p.paymentId!);
        if (info.status === p.status && info.final_status === p.final) return p;
        const next = { ...p, status: info.status, final: info.final_status, reason: info.status_reason_information?.status_reason_description ?? p.reason };
        await savePayment(next);
        return next;
      } catch {
        return p;
      }
    }),
  );
  const byId = new Map(fresh.map((p) => [p.id, p]));
  return payments.map((p) => byId.get(p.id) ?? p);
}

/** Cosa accetta una banca, in una riga. */
function SupportLine({ s, bank }: { s: BankSupport; bank: BankView }) {
  if (bank.expired) return <span className="pay-status ko">Consenso scaduto: ricollega la banca</span>;
  if (!bank.accounts.some((a) => a.iban)) return <span className="pay-status ko">Nessun conto con IBAN collegato: ricollega la banca</span>;
  if (s.kind === "unknown") return <span className="pay-status wait">Non verificabile: {s.error}</span>;
  if (s.kind === "none") return <span className="pay-status ko">Non accetta bonifici via Enable Banking</span>;
  const yes = (b: boolean | null) => (b === null ? "non indicato" : b ? "sì" : "no");
  return (
    <span className={`pay-status ${s.ordinary ? "ok" : "wait"}`}>
      Ordinario: {yes(s.ordinary)} · Istantaneo: {yes(s.instant)}
    </span>
  );
}

function StatusLine({ p }: { p: StoredPayment }) {
  if (p.status === "error") return <span className="pay-status ko">Non autorizzato{p.reason ? `: ${p.reason}` : ""}</span>;
  const s = describeStatus(p.status, p.final);
  return (
    <span className={`pay-status ${s.tone}`}>
      {s.label}
      {p.reason && s.tone === "ko" ? `: ${p.reason}` : ""}
    </span>
  );
}

/** Bonifici SEPA dai conti collegati, autorizzati ogni volta con la SCA della banca. */
export default async function TransfersPage({ searchParams }: PageProps<"/bonifici">) {
  const sp = await searchParams;
  const error = str(sp.error) || null;
  const draftId = str(sp.bozza);
  const outcomeId = str(sp.esito);
  const isOwner = (await authRole((await cookies()).get(AUTH_COOKIE)?.value)) === "owner";

  let banks: BankView[] = [];
  let payments: StoredPayment[] = [];
  let coverage: Record<string, PisCoverage> = {};
  let loadError: string | null = null;
  if (hasStore()) {
    try {
      // Solo l'ultima lettura salvata: per scegliere il conto non serve rileggere la banca
      [banks, payments] = await Promise.all([loadDashboard(psuHeadersFrom(await headers()), { cacheOnly: true }), listPayments()]);
      [payments, coverage] = await Promise.all([refreshStatuses(payments), pisCoverage(banks.map((b) => b.country))]);
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    }
  }

  const support = new Map(banks.map((b) => [b.sessionId, bankSupport({ name: b.bank, country: b.country }, coverage)]));
  // Prima i conti delle banche che accettano bonifici: il primo è quello proposto
  const sources: Source[] = banks
    .filter((b) => !b.expired)
    .flatMap((bank) => bank.accounts.filter((a) => a.iban).map((account) => ({ bank, account })))
    .sort((a, b) => Number(support.get(a.bank.sessionId)?.kind === "none") - Number(support.get(b.bank.sessionId)?.kind === "none"));
  const draft = draftId ? payments.find((p) => p.id === draftId && p.status === "draft") ?? null : null;
  const outcome = outcomeId ? payments.find((p) => p.id === outcomeId) ?? null : null;
  const history = payments.filter((p) => p.status !== "draft");
  const recents = recentBeneficiaries(payments);

  // Valori del modulo: da una bozza da modificare, dai parametri (ritorno con errore, scorciatoie) o vuoti
  const editing = str(sp.modifica) ? payments.find((p) => p.id === str(sp.modifica) && p.status === "draft") : undefined;
  const v = {
    da: str(sp.da) || editing?.fromUid || sources[0]?.account.uid || "",
    nome: str(sp.nome) || editing?.name || "",
    iban: str(sp.iban) || editing?.iban || "",
    importo: str(sp.importo) || (editing ? String(editing.amount).replace(".", ",") : ""),
    causale: str(sp.causale) || editing?.reference || "",
    istantaneo: str(sp.istantaneo) === "1" || !!editing?.instant,
  };
  const prefill = (extra: Record<string, string>) => {
    const q = new URLSearchParams({ da: v.da, nome: v.nome, iban: v.iban, importo: v.importo, causale: v.causale, ...(v.istantaneo ? { istantaneo: "1" } : {}), ...extra });
    for (const [k, val] of [...q.entries()]) if (!val) q.delete(k);
    return `/bonifici?${q}`;
  };
  const nameFor = (iban: string) => recents.find((r) => r.iban === iban)?.name ?? "";
  const ownTargets = sources.filter((s) => s.account.uid !== v.da);
  const draftSource = draft ? sources.find((s) => s.account.uid === draft.fromUid) : undefined;

  return (
    <main className="container">
      <Nav current="/bonifici" />
      <h1 className="page-title">Bonifici</h1>

      {error && <div className="notice error">{error}</div>}
      {loadError && <div className="notice error">{loadError}</div>}
      {!isOwner && <div className="notice">Con l&apos;accesso bot i bonifici si vedono ma non si possono fare.</div>}

      {outcome && !draft && (
        <div className={`notice${describeStatus(outcome.status).tone === "ko" || outcome.status === "error" ? " error" : " ok"}`}>
          {fmt(outcome.amount, outcome.currency)} a {outcome.name}: <StatusLine p={outcome} />
        </div>
      )}

      {!draft && banks.length > 0 && (
        <section className="card bank">
          <div className="bank-head">
            <div className="bank-name">Le tue banche</div>
          </div>
          {banks.map((b) => (
            <div key={b.sessionId} className="account">
              <div>
                <div className="account-label">{b.bank}</div>
                <div className="account-iban"><SupportLine s={support.get(b.sessionId)!} bank={b} /></div>
              </div>
            </div>
          ))}
          <p className="form-hint" style={{ margin: "10px 0 0" }}>
            Dall&apos;elenco ufficiale di Enable Banking, riletto due volte al giorno. Dice cosa accetta la banca: per partire serve anche
            che la tua applicazione Enable Banking sia abilitata ai pagamenti.
          </p>
        </section>
      )}

      {draft ? (
        <section className="card form-grid bank">
          <div className="form-title">Controlla il bonifico</div>
          <dl className="pay-review">
            <dt>Da</dt>
            <dd>{draft.bank} · {draft.fromLabel}<span className="account-iban">{maskIban(draft.fromIban)}</span></dd>
            <dt>A</dt>
            <dd>{draft.name}<span className="account-iban">{formatIban(draft.iban)}</span></dd>
            <dt>Importo</dt>
            <dd className="amount pay-amount">{fmt(draft.amount, draft.currency)}</dd>
            <dt>Causale</dt>
            <dd>{draft.reference}</dd>
            <dt>Tipo</dt>
            <dd>{draft.instant ? "Istantaneo (SCT Inst)" : "Ordinario (SEPA)"}</dd>
          </dl>
          {draftSource?.account.amount != null && draftSource.account.amount < draft.amount && (
            <div className="notice">L&apos;ultimo saldo letto (<span className="amount">{fmt(draftSource.account.amount, draft.currency)}</span>) è più basso dell&apos;importo: la banca potrebbe rifiutarlo.</div>
          )}
          <p className="form-hint" style={{ margin: 0 }}>
            Premendo “Autorizza in banca” vai su {draft.bank}, che ti mostra di nuovo i dati e chiede la conferma con le tue credenziali
            (SCA). Finché non confermi lì non parte nulla.
          </p>
          {isOwner && (
            <form method="post" action="/api/payments" className="form-grid">
              <input type="hidden" name="id" value={draft.id} />
              <button className="btn btn-primary" type="submit" name="action" value="send">Autorizza in banca</button>
            </form>
          )}
          <div className="pay-actions">
            <Link className="btn btn-ghost" href={`/bonifici?modifica=${draft.id}`}>Modifica</Link>
            <form method="post" action="/api/payments" style={{ display: "inline" }}>
              <input type="hidden" name="id" value={draft.id} />
              <button className="btn btn-ghost danger" type="submit" name="action" value="discard">Annulla</button>
            </form>
          </div>
        </section>
      ) : sources.length === 0 ? (
        <section className="card bank">
          <p className="bank-meta">
            Nessun conto collegato con IBAN e consenso valido. <Link href="/connect">Collega una banca</Link> per fare bonifici dai tuoi conti.
          </p>
        </section>
      ) : (
        <form key={editing?.id ?? "new"} className="card form-grid bank" method="post" action="/api/payments">
          <input type="hidden" name="action" value="review" />
          {editing && <input type="hidden" name="replace" value={editing.id} />}
          <div className="form-title">Nuovo bonifico</div>
          <label>
            Dal conto
            <select name="from" defaultValue={v.da} required>
              {sources.map(({ bank, account }) => (
                <option key={account.uid} value={account.uid}>
                  {bank.bank} · {account.label} ({maskIban(account.iban)}){support.get(bank.sessionId)?.kind === "none" ? " · non accetta bonifici" : ""}
                </option>
              ))}
            </select>
          </label>

          {(ownTargets.length > 0 || recents.length > 0) && (
            <div className="pay-quick">
              {ownTargets.length > 0 && (
                <div>
                  <div className="pay-quick-label">Giroconto verso un tuo conto</div>
                  <div className="periods">
                    {ownTargets.map(({ bank, account }) => (
                      <Link key={account.uid} className="period" href={prefill({ iban: account.iban!, nome: nameFor(account.iban!) || v.nome })} aria-current={v.iban === account.iban ? "page" : undefined}>
                        {bank.bank} · {account.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {recents.length > 0 && (
                <div>
                  <div className="pay-quick-label">Già pagati</div>
                  <div className="periods">
                    {recents.map((r) => (
                      <Link key={r.iban} className="period" href={prefill({ iban: r.iban, nome: r.name })} aria-current={v.iban === r.iban ? "page" : undefined}>
                        {r.name}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <label>
            Beneficiario
            <input name="name" required maxLength={MAX_NAME} autoComplete="off" placeholder="Nome e cognome o ragione sociale" defaultValue={v.nome} />
          </label>
          <p className="form-hint">Scrivilo come lo intesta la sua banca: dal 2025 la banca confronta nome e IBAN prima di inviare.</p>
          <label>
            IBAN del beneficiario
            <input name="iban" required autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="IT60 X054 2811 1010 0000 0123 456" defaultValue={v.iban ? formatIban(v.iban) : ""} />
          </label>
          <label>
            Importo in euro
            <input name="amount" required inputMode="decimal" placeholder="es. 150,00" defaultValue={v.importo} />
          </label>
          <label>
            Causale
            <input name="reference" required maxLength={MAX_REFERENCE} placeholder="es. Affitto dicembre" defaultValue={v.causale} />
          </label>
          <label className="check">
            <input type="checkbox" name="instant" defaultChecked={v.istantaneo} />
            Istantaneo (arriva in pochi secondi, se la banca lo permette via API)
          </label>
          <button className="btn btn-primary" type="submit" disabled={!isOwner}>Continua</button>
          <p className="form-hint" style={{ margin: 0 }}>Prima di partire vedi il riepilogo; poi la conferma la dai sulla tua banca.</p>
        </form>
      )}

      {history.length > 0 && (
        <section className="card bank">
          <div className="bank-head">
            <div className="bank-name">Ultimi bonifici</div>
          </div>
          {history.map((p) => (
            <div key={p.id} className="account">
              <div>
                <div className="account-label">{p.name}</div>
                <div className="account-iban">
                  {when(p.createdAt)} · da {p.bank} {maskIban(p.fromIban)} · {p.reference}
                </div>
                <div className="account-iban"><StatusLine p={p} /></div>
              </div>
              {p.status === "error" || describeStatus(p.status).tone === "ko" ? (
                <div className="amount pay-void">{fmt(p.amount, p.currency)}</div>
              ) : (
                <div className="amount">−{fmt(p.amount, p.currency)}</div>
              )}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}

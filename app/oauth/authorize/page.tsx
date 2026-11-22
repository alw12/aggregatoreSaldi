import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, authRole } from "@/lib/auth";
import { parseAuthorize, redirectBack } from "@/lib/oauth-core";
import { getClient, startConsent } from "@/lib/oauth";
import { hasStore } from "@/lib/store";
import { requestOrigin } from "@/lib/origin";

export const dynamic = "force-dynamic";

/** Cosa può leggere Claude: lo stesso elenco degli strumenti del connettore. */
const READS = [
  "Patrimonio, saldi dei conti e carte",
  "Movimenti e spese per categoria",
  "Budget, report mensili e spese ricorrenti",
  "Portafoglio, buoni, debiti e beni",
  "Storico, avvisi e spese per il 730",
];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="login-wrap">
      <div className="card login consent">{children}</div>
    </main>
  );
}

/**
 * Pagina di consenso OAuth: ci arrivi da claude.ai dopo aver aggiunto il connettore.
 * Il login lo fa già il proxy; qui solo il proprietario (non il bot) può dire sì.
 */
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") q.set(k, v);
  const origin = requestOrigin(await headers());

  if (!hasStore()) return <Shell><h1>Connetti Claude</h1><div className="notice error">Storage non configurato.</div></Shell>;
  const role = await authRole((await cookies()).get(AUTH_COOKIE)?.value);
  if (role !== "owner")
    return (
      <Shell>
        <h1>Connetti Claude</h1>
        <div className="notice error">Solo il proprietario può collegare Claude ai dati di Saldi.</div>
      </Shell>
    );

  const client = await getClient(q.get("client_id"));
  const parsed = parseAuthorize(q, client, origin);
  if ("fatal" in parsed)
    return (
      <Shell>
        <h1>Connetti Claude</h1>
        <div className="notice error">{parsed.fatal}</div>
      </Shell>
    );
  if ("error" in parsed) redirect(redirectBack(parsed.redirectUri, { error: parsed.error, error_description: parsed.description, state: parsed.state }, origin));

  const p = parsed.ok;
  const nonce = await startConsent(p);
  const back = new URL(p.redirectUri);

  return (
    <Shell>
      <h1>Connetti Claude</h1>
      <p>
        <strong>{client!.client_name}</strong> chiede di leggere i tuoi dati di Saldi.
      </p>
      <ul className="consent-list">
        {READS.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <p className="consent-note">
        Solo lettura: non può spostare soldi, modificare nulla né leggere di nuovo le banche. Puoi revocare l’accesso quando vuoi dalla
        pagina Claude di Saldi. Dopo il sì torni a <strong>{back.host}</strong>.
      </p>
      <form method="post" action="/api/oauth/authorize" className="consent-actions">
        <input type="hidden" name="nonce" value={nonce} />
        <button className="btn btn-ghost" type="submit" name="decision" value="deny">Annulla</button>
        <button className="btn btn-primary" type="submit" name="decision" value="allow">Consenti</button>
      </form>
    </Shell>
  );
}

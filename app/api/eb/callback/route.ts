import { NextResponse, type NextRequest } from "next/server";
import { authorizeSession, getPayment } from "@/lib/eb";
import { STATE_COOKIE, saveSession, type StoredAccount } from "@/lib/store";
import { PAY_STATE_COOKIE, paymentForState, savePayment } from "@/lib/payment-store";

function back(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/connect", request.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url, 303);
  res.cookies.delete({ name: STATE_COOKIE, path: "/api/eb/callback" });
  return res;
}

/** Ritorno dall'autorizzazione di un bonifico: niente codice da scambiare, si legge lo stato del pagamento. */
async function paymentReturn(request: NextRequest, state: string) {
  const q = request.nextUrl.searchParams;
  const p = await paymentForState(state);
  const url = new URL("/bonifici", request.url);
  if (p) {
    url.searchParams.set("esito", p.id);
    const error = q.get("error");
    let next = { ...p };
    try {
      const info = p.paymentId ? await getPayment(p.paymentId) : null;
      if (info) {
        next = {
          ...next,
          status: info.status,
          final: info.final_status,
          reason: info.status_reason_information?.status_reason_description ?? undefined,
        };
      }
    } catch {
      // lo stato si rilegge aprendo la pagina dei bonifici
    }
    // L'utente ha annullato o la banca ha dato errore, e il pagamento non risulta comunque partito
    if (error && (next.status === "RCVD" || next.status === "draft")) {
      next = { ...next, status: "error", final: true, reason: q.get("error_description") ?? error };
    }
    await savePayment(next);
  } else {
    url.searchParams.set("error", "Bonifico non trovato: controlla lo stato in banca");
  }
  const res = NextResponse.redirect(url, 303);
  res.cookies.delete({ name: PAY_STATE_COOKIE, path: "/api/eb/callback" });
  return res;
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const payState = request.cookies.get(PAY_STATE_COOKIE)?.value;
  if (payState && q.get("state") === payState) return paymentReturn(request, payState);
  const error = q.get("error");
  if (error) return back(request, { error: q.get("error_description") ?? error });

  const code = q.get("code");
  const state = q.get("state");
  const expected = request.cookies.get(STATE_COOKIE)?.value;
  if (!code) return back(request, { error: "Codice di autorizzazione mancante" });
  if (!state || state !== expected) return back(request, { error: "State non valido: riprova il collegamento" });

  try {
    const session = await authorizeSession(code);
    const accounts: StoredAccount[] = session.accounts
      .filter((a): a is typeof a & { uid: string } => Boolean(a.uid))
      .map((a) => ({
        uid: a.uid,
        iban: a.account_id?.iban,
        label: a.details || a.product || a.name || a.account_id?.iban || "Conto",
        currency: a.currency,
        type: a.cash_account_type,
      }));

    await saveSession({
      sessionId: session.session_id,
      aspsp: session.aspsp,
      validUntil: session.access.valid_until,
      createdAt: new Date().toISOString(),
      accounts,
    });

    const res = NextResponse.redirect(new URL("/", request.url), 303);
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/eb/callback" });
    return res;
  } catch (e) {
    return back(request, { error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
  }
}

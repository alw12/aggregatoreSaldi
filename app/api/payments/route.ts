import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authRole } from "@/lib/auth";
import { createPayment, listPisAspsps } from "@/lib/eb";
import { describePisError as describeError } from "@/lib/pis";
import { psuHeadersFrom } from "@/lib/data";
import { ebRedirectUrl, requestOrigin } from "@/lib/origin";
import { PAY_STATE_COOKIE, bindState, getPayment, lockSend, removePayment, unlockSend, savePayment, type StoredPayment } from "@/lib/payment-store";
import { parseTransfer, paymentBody, pickPaymentType } from "@/lib/payments";
import { listSessions } from "@/lib/store";

function back(request: NextRequest, params: Record<string, string> = {}) {
  const url = new URL("/bonifici", request.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  // Solo il proprietario: l'utente bot e il connettore di Claude restano in sola lettura
  if ((await authRole(request.cookies.get(AUTH_COOKIE)?.value)) !== "owner") {
    return back(request, { error: "Solo il proprietario può fare bonifici" });
  }
  // Il cookie è SameSite=Lax, ma un controllo in più sull'origine non costa nulla
  const origin = request.headers.get("origin");
  if (origin && origin !== requestOrigin(request.headers) && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "origine non valida" }, { status: 403 });
  }

  const form = await request.formData();
  const action = String(form.get("action") ?? "review");
  const id = String(form.get("id") ?? "");

  if (action === "discard") {
    const p = await getPayment(id);
    if (p?.status === "draft") await removePayment(id);
    return back(request);
  }

  if (action === "send") {
    const p = await getPayment(id);
    if (!p || p.status !== "draft") return back(request, { error: "Bonifico non trovato o già inviato" });
    if (!(await lockSend(p.id))) return back(request, { bozza: id, error: "Invio già in corso: aspetta qualche secondo" });
    try {
      const banks = await listPisAspsps(p.country);
      const bank = banks.find((b) => b.name === p.bank);
      if (!bank) return back(request, { bozza: id, error: `${p.bank} non permette bonifici via Enable Banking` });
      const paymentType = pickPaymentType(bank.payments?.map((t) => t.payment_type), p.instant);
      if (!paymentType) {
        return back(request, {
          bozza: id,
          error: p.instant ? `${p.bank} non permette il bonifico istantaneo via API: togli “istantaneo”` : `${p.bank} non permette il bonifico ordinario via API`,
        });
      }
      const state = crypto.randomUUID();
      const created = await createPayment(
        paymentBody({
          draft: p,
          paymentType,
          fromIban: p.fromIban,
          currency: p.currency,
          aspsp: { name: p.bank, country: p.country },
          state,
          redirectUrl: ebRedirectUrl(request.url),
        }),
        psuHeadersFrom(request.headers),
      );
      await savePayment({ ...p, paymentId: created.payment_id, status: created.status, state, final: false });
      await bindState(state, p.id);
      const res = NextResponse.redirect(created.url, 303);
      res.cookies.set(PAY_STATE_COOKIE, state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/api/eb/callback",
        maxAge: 30 * 60,
      });
      return res;
    } catch (e) {
      return back(request, { bozza: id, error: describeError(e).slice(0, 400) });
    } finally {
      // Dopo l'invio la bozza non è più "draft": il blocco serve solo mentre si parla con la banca
      await unlockSend(p.id);
    }
  }

  // action === "review": controlla i dati e salva una bozza da confermare
  const fromUid = String(form.get("from") ?? "");
  const sessions = await listSessions();
  const session = sessions.find((s) => s.accounts.some((a) => a.uid === fromUid));
  const account = session?.accounts.find((a) => a.uid === fromUid);
  const input = {
    fromUid,
    name: String(form.get("name") ?? ""),
    iban: String(form.get("iban") ?? ""),
    amount: form.get("amount"),
    reference: String(form.get("reference") ?? ""),
    instant: form.get("instant") === "on",
  };
  const keep = {
    da: fromUid,
    nome: input.name,
    iban: input.iban,
    importo: String(input.amount ?? ""),
    causale: input.reference,
    ...(input.instant ? { istantaneo: "1" } : {}),
  };
  if (!session || !account) return back(request, { ...keep, error: "Scegli il conto da cui partire" });
  if (!account.iban) return back(request, { ...keep, error: "Di questo conto la banca non ha dato l'IBAN: non si può usare per i bonifici" });
  if (new Date(session.validUntil).getTime() <= Date.now()) {
    return back(request, { ...keep, error: `Il consenso di ${session.aspsp.name} è scaduto: ricollega la banca` });
  }

  const parsed = parseTransfer(input, account.iban);
  if (!parsed.ok) return back(request, { ...keep, error: parsed.error });

  const now = new Date().toISOString();
  const draft: StoredPayment = {
    ...parsed.draft,
    id: crypto.randomUUID(),
    sessionId: session.sessionId,
    bank: session.aspsp.name,
    country: session.aspsp.country,
    fromIban: account.iban,
    fromLabel: account.label,
    currency: account.currency || "EUR",
    status: "draft",
    final: false,
    createdAt: now,
    updatedAt: now,
  };
  if (draft.currency !== "EUR") return back(request, { ...keep, error: "I bonifici SEPA partono solo da conti in euro" });
  await savePayment(draft);
  // Da "Modifica": la bozza vecchia non serve più
  const replaced = await getPayment(String(form.get("replace") ?? ""));
  if (replaced?.status === "draft") await removePayment(replaced.id);
  return back(request, { bozza: draft.id });
}

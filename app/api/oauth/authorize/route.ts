import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authRole } from "@/lib/auth";
import { redirectBack } from "@/lib/oauth-core";
import { getClient, issueCode, takeConsent } from "@/lib/oauth";
import { requestOrigin } from "@/lib/origin";

/** Risposta al modulo di consenso: con il sì nasce il codice monouso e si torna a Claude. */
export async function POST(request: NextRequest) {
  if ((await authRole(request.cookies.get(AUTH_COOKIE)?.value)) !== "owner")
    return new NextResponse("Solo il proprietario può collegare Claude.", { status: 403 });
  const form = await request.formData();
  const p = await takeConsent(String(form.get("nonce") ?? ""));
  if (!p) return new NextResponse("Richiesta scaduta o già usata: ricomincia da Claude.", { status: 400 });
  const origin = requestOrigin(request.headers);

  if (form.get("decision") !== "allow")
    return NextResponse.redirect(redirectBack(p.redirectUri, { error: "access_denied", error_description: "Accesso negato", state: p.state }, origin), 303);

  const client = await getClient(p.clientId);
  if (!client) return new NextResponse("Client non più registrato: ricomincia da Claude.", { status: 400 });
  const code = await issueCode(p, client.client_name);
  return NextResponse.redirect(redirectBack(p.redirectUri, { code, state: p.state }, origin), 303);
}

import { NextResponse, type NextRequest } from "next/server";
import { clientCredentials } from "@/lib/oauth-core";
import { clientAuthenticated, exchangeCode, getClient, refreshTokens } from "@/lib/oauth";

const noStore = { "Cache-Control": "no-store", Pragma: "no-cache" };
const fail = (error: string, error_description: string, status = 400) =>
  NextResponse.json({ error, error_description }, { status, headers: noStore });

/** Il corpo è form-urlencoded (RFC 6749); per tolleranza si accetta anche JSON. */
async function readForm(request: NextRequest): Promise<URLSearchParams> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const j = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return new URLSearchParams(Object.entries(j).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
  }
  return new URLSearchParams(await request.text());
}

/** Scambia il codice (con PKCE) o il refresh token con un nuovo token di accesso. */
export async function POST(request: NextRequest) {
  const form = await readForm(request);
  const cred = clientCredentials(request.headers.get("authorization"), form);
  const client = await getClient(cred.id);
  if (!client || !(await clientAuthenticated(client, cred.secret, cred.basic))) {
    const res = fail("invalid_client", "Client sconosciuto o credenziali errate", 401);
    if (cred.basic) res.headers.set("WWW-Authenticate", 'Basic realm="saldi"');
    return res;
  }

  const grant = form.get("grant_type");
  const result =
    grant === "authorization_code"
      ? await exchangeCode(client, form.get("code") ?? "", form.get("redirect_uri"), form.get("code_verifier"))
      : grant === "refresh_token"
        ? await refreshTokens(client, form.get("refresh_token") ?? "")
        : { error: "unsupported_grant_type", error_description: "Solo authorization_code e refresh_token" };
  if ("error" in result) return fail(result.error, result.error_description);
  return NextResponse.json(result, { headers: noStore });
}

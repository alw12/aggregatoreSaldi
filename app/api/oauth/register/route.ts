import { NextResponse, type NextRequest } from "next/server";
import { extraRedirects, parseRegistration } from "@/lib/oauth-core";
import { registerClient } from "@/lib/oauth";

const noStore = { "Cache-Control": "no-store" };

/**
 * Registrazione dinamica dei client (RFC 7591): claude.ai si registra da sola la prima volta.
 * Registrarsi non dà accesso a nulla: serve comunque il tuo consenso da loggato.
 * Sono ammessi solo i redirect di Claude e quelli locali.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_client_metadata", error_description: "JSON non valido" }, { status: 400, headers: noStore });
  }
  const reg = parseRegistration(body, extraRedirects(process.env.OAUTH_EXTRA_REDIRECTS));
  if ("error" in reg) return NextResponse.json({ error: reg.error, error_description: reg.description }, { status: 400, headers: noStore });
  try {
    const { client, secret } = await registerClient(reg);
    return NextResponse.json(
      {
        client_id: client.client_id,
        ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
        client_id_issued_at: Math.floor(Date.parse(client.createdAt) / 1000),
        client_name: client.client_name,
        redirect_uris: client.redirect_uris,
        token_endpoint_auth_method: client.token_endpoint_auth_method,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      },
      { status: 201, headers: noStore },
    );
  } catch (e) {
    return NextResponse.json(
      { error: "temporarily_unavailable", error_description: e instanceof Error ? e.message : String(e) },
      { status: 503, headers: noStore },
    );
  }
}

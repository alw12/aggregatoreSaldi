import { NextResponse, type NextRequest } from "next/server";
import { clientCredentials } from "@/lib/oauth-core";
import { clientAuthenticated, getClient, revokeToken } from "@/lib/oauth";

/** RFC 7009: il client butta un suo token. Risponde 200 anche se il token non esiste. */
export async function POST(request: NextRequest) {
  const form = new URLSearchParams(await request.text());
  const cred = clientCredentials(request.headers.get("authorization"), form);
  const client = await getClient(cred.id);
  if (!client || !(await clientAuthenticated(client, cred.secret, cred.basic)))
    return NextResponse.json({ error: "invalid_client" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const token = form.get("token");
  if (token) await revokeToken(token);
  return new NextResponse(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}

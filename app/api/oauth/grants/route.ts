import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authRole } from "@/lib/auth";
import { revokeAllGrants, revokeGrant } from "@/lib/oauth";

/** Revoca dalla pagina Claude: un accesso o tutti. I token di quell'accesso smettono subito di funzionare. */
export async function POST(request: NextRequest) {
  if ((await authRole(request.cookies.get(AUTH_COOKIE)?.value)) !== "owner")
    return new NextResponse("Solo il proprietario può revocare gli accessi.", { status: 403 });
  const form = await request.formData();
  const id = String(form.get("id") ?? "");
  if (id === "*") await revokeAllGrants();
  else if (id) await revokeGrant(id);
  return NextResponse.redirect(new URL("/claude?revocato=1", request.url), 303);
}

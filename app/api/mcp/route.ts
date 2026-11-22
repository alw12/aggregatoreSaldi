import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { bearer, resourceUrl } from "@/lib/oauth-core";
import { checkAccessToken, logCall } from "@/lib/oauth";
import { handleMessage, INVALID_REQUEST, PARSE_ERROR, type Response as RpcResponse } from "@/lib/mcp";
import { buildTools, INSTRUCTIONS } from "@/lib/mcp-tools";
import { hasStore } from "@/lib/store";
import { requestOrigin } from "@/lib/origin";

export const dynamic = "force-dynamic";

const MAX_BODY = 1_000_000;

/** 401 con l'indirizzo dei metadati: è così che Claude scopre dove fare il login (RFC 9728). */
function unauthorized(origin: string, invalid: boolean) {
  const meta = `${origin}/.well-known/oauth-protected-resource`;
  const challenge = invalid
    ? `Bearer error="invalid_token", error_description="Token scaduto o revocato", resource_metadata="${meta}"`
    : `Bearer resource_metadata="${meta}"`;
  return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "WWW-Authenticate": challenge, "Cache-Control": "no-store" } });
}

const rpcError = (code: number, message: string, status = 400) =>
  NextResponse.json({ jsonrpc: "2.0", id: null, error: { code, message } }, { status });

/** Server MCP di Saldi (HTTP streamable, senza stato): ogni POST è un messaggio JSON-RPC. */
export async function POST(request: NextRequest) {
  const origin = requestOrigin(request.headers);
  if (!hasStore()) return rpcError(-32603, "Storage non configurato", 503);

  const token = bearer(request.headers.get("authorization"));
  const grant = token ? await checkAccessToken(token, resourceUrl(origin)) : null;
  if (!grant) return unauthorized(origin, !!token);

  const raw = await request.text();
  if (raw.length > MAX_BODY) return rpcError(INVALID_REQUEST, "Richiesta troppo grande", 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return rpcError(PARSE_ERROR, "JSON non valido");
  }

  const tools = buildTools();
  // Il registro delle letture si scrive dopo la risposta, per non rallentarla
  const onCall = (tool: string, ok: boolean) => void after(() => logCall(grant, tool, ok).catch(() => undefined));
  const handle = (m: unknown) => handleMessage(m, tools, INSTRUCTIONS, onCall);

  if (Array.isArray(body)) {
    if (!body.length) return rpcError(INVALID_REQUEST, "Batch vuoto");
    const out = (await Promise.all(body.map(handle))).filter((r): r is RpcResponse => r !== null);
    return out.length ? NextResponse.json(out, { headers: { "Cache-Control": "no-store" } }) : new NextResponse(null, { status: 202 });
  }
  const res = await handle(body);
  return res ? NextResponse.json(res, { headers: { "Cache-Control": "no-store" } }) : new NextResponse(null, { status: 202 });
}

/** Niente stream lato server né sessioni: GET e DELETE non servono (spec MCP, HTTP streamable). */
export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

export function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

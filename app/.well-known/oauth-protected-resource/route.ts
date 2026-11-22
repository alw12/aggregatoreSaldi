import { NextResponse, type NextRequest } from "next/server";
import { protectedResourceMetadata } from "@/lib/oauth-core";
import { requestOrigin } from "@/lib/origin";

/** RFC 9728: il server MCP di Saldi e il suo server di autorizzazione. Pubblico, senza dati. */
export function GET(request: NextRequest) {
  return NextResponse.json(protectedResourceMetadata(requestOrigin(request.headers)), {
    headers: { "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" },
  });
}

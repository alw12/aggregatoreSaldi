import { NextResponse, type NextRequest } from "next/server";
import { authServerMetadata } from "@/lib/oauth-core";
import { requestOrigin } from "@/lib/origin";

/** RFC 8414: dove registrarsi, chiedere il consenso e ottenere i token. Pubblico, senza dati. */
export function GET(request: NextRequest) {
  return NextResponse.json(authServerMetadata(requestOrigin(request.headers)), {
    headers: { "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" },
  });
}

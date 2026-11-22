import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, verifyAuthToken } from "@/lib/auth";

// /api/portfolio/sync si autentica da sé con SYNC_TOKEN, /api/cron/daily con CRON_SECRET.
// Il connettore di Claude: /api/mcp vuole un token OAuth, registrazione/token/revoca sono il protocollo
// OAuth stesso, /.well-known sono metadati pubblici. Il consenso (/oauth/authorize) resta dietro il login.
const PUBLIC_PATHS = [
  "/login",
  "/api/login",
  "/api/portfolio/sync",
  "/api/cron/daily",
  "/api/mcp",
  "/api/oauth/register",
  "/api/oauth/token",
  "/api/oauth/revoke",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/.well-known/")) return NextResponse.next();

  const ok = await verifyAuthToken(request.cookies.get(AUTH_COOKIE)?.value);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL("/login", request.url);
  // Con la query: il consenso OAuth deve ritrovare i suoi parametri dopo il login
  if (pathname !== "/") url.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  // Manifest, icone e service worker devono essere leggibili senza login (il browser li scarica senza cookie)
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|manifest.webmanifest|sw.js|icons/).*)"],
};

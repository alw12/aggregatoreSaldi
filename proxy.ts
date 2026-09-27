import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, verifyAuthToken } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/login"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Su Vercel: porta ogni accesso (URL di deploy, preview) al dominio di produzione,
  // così cookie e redirect di Enable Banking puntano sempre allo stesso host
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod && process.env.VERCEL_ENV === "production" && request.nextUrl.host !== prod) {
    const url = request.nextUrl.clone();
    url.host = prod;
    url.protocol = "https";
    url.port = "";
    return NextResponse.redirect(url, 308);
  }
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  const ok = await verifyAuthToken(request.cookies.get(AUTH_COOKIE)?.value);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL("/login", request.url);
  if (pathname !== "/") url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};

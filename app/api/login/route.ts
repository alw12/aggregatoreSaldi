import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authCookieOptions, checkPassword, createAuthToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (!(await checkPassword(password))) {
    // Rallenta i tentativi a forza bruta
    await new Promise((r) => setTimeout(r, 1500));
    const url = new URL("/login", request.url);
    url.searchParams.set("error", "1");
    if (safeNext !== "/") url.searchParams.set("next", safeNext);
    return NextResponse.redirect(url, 303);
  }

  const res = NextResponse.redirect(new URL(safeNext, request.url), 303);
  res.cookies.set(AUTH_COOKIE, await createAuthToken(), authCookieOptions);
  return res;
}

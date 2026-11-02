import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authCookieOptions, checkPassword, createAuthToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const role = await checkPassword(password);
  if (!role) {
    // Rallenta i tentativi a forza bruta
    await new Promise((r) => setTimeout(r, 1500));
    const url = new URL("/login", request.url);
    // Diagnostica: la password del bot su Vercel ha spazi o a capo ai bordi che chi la digita non mette
    const bot = process.env.BOT_PASSWORD;
    const spaces = !!bot && bot.trim() !== bot && password.trim() === bot.trim();
    url.searchParams.set("error", spaces ? "spaces" : "1");
    if (safeNext !== "/") url.searchParams.set("next", safeNext);
    return NextResponse.redirect(url, 303);
  }

  const res = NextResponse.redirect(new URL(safeNext, request.url), 303);
  res.cookies.set(AUTH_COOKIE, await createAuthToken(role), authCookieOptions);
  return res;
}

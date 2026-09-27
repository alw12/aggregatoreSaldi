import { NextResponse, type NextRequest } from "next/server";
import { startAuth } from "@/lib/eb";
import { STATE_COOKIE } from "@/lib/store";

function redirectUrl(request: NextRequest): string {
  if (process.env.EB_REDIRECT_URL) return process.env.EB_REDIRECT_URL;
  // Su Vercel usa sempre il dominio di produzione: deve coincidere con quello registrato su Enable Banking
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}/api/eb/callback`;
  return new URL("/api/eb/callback", request.url).toString();
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const name = String(form.get("name") ?? "");
  const country = String(form.get("country") ?? "IT");
  const maxValidity = Number(form.get("maxValidity") ?? 0);
  if (!name) return NextResponse.json({ error: "banca mancante" }, { status: 400 });

  // Consenso più lungo possibile (tipicamente 180 giorni), con un'ora di margine
  const seconds = maxValidity > 0 ? maxValidity - 3600 : 90 * 86400;
  const validUntil = new Date(Date.now() + seconds * 1000);
  const state = crypto.randomUUID();

  try {
    const { url } = await startAuth({
      aspsp: { name, country },
      validUntil,
      redirectUrl: redirectUrl(request),
      state,
    });
    const res = NextResponse.redirect(url, 303);
    res.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/eb/callback",
      maxAge: 15 * 60,
    });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const url = new URL("/connect", request.url);
    url.searchParams.set("error", msg.slice(0, 300));
    return NextResponse.redirect(url, 303);
  }
}

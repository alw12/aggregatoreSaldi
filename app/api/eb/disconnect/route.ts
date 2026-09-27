import { NextResponse, type NextRequest } from "next/server";
import { deleteSession } from "@/lib/eb";
import { removeSession } from "@/lib/store";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const sessionId = String(form.get("sessionId") ?? "");
  if (sessionId) {
    try {
      await deleteSession(sessionId); // revoca il consenso lato banca, se possibile
    } catch {
      // sessione già scaduta o inesistente: la rimuoviamo comunque in locale
    }
    await removeSession(sessionId);
  }
  return NextResponse.redirect(new URL("/", request.url), 303);
}

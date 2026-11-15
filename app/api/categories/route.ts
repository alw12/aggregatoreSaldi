import { NextResponse, type NextRequest } from "next/server";
import { isCategory } from "@/lib/categories";
import { setCatRule } from "@/lib/cat-store";

/** Correzione di categoria per tutta una controparte; category "auto" la toglie. */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const key = String(form.get("key") ?? "").trim().slice(0, 40);
  // "Torna automatica" ha un suo pulsante: nello stesso modulo c'è anche la scelta della categoria
  const category = form.get("reset") ? "auto" : String(form.get("category") ?? "");
  const party = String(form.get("party") ?? "").slice(0, 120);
  const url = new URL("/categorie", request.url);
  if (party) url.searchParams.set("p", party);
  if (!key || (category !== "auto" && !isCategory(category))) {
    url.searchParams.set("error", "Categoria non valida");
    return NextResponse.redirect(url, 303);
  }
  await setCatRule(key, category === "auto" ? null : category);
  url.searchParams.set("ok", category === "auto" ? "auto" : "1");
  return NextResponse.redirect(url, 303);
}

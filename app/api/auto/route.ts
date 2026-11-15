import { NextResponse, type NextRequest } from "next/server";
import { saveCarSettings } from "@/lib/car-store";
import type { CarSettings } from "@/lib/car";
import { parseNumber } from "@/lib/parse";

/** Impostazioni dell'auto: debito della rata, spese annuali, km all'anno. Campi vuoti = non usati. */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const url = new URL("/auto", request.url);
  const num = (k: string) => parseNumber(form.get(k));
  const fields = { assicurazione: num("assicurazione"), bollo: num("bollo"), manutenzione: num("manutenzione"), km: num("km") };
  for (const [k, v] of Object.entries(fields)) {
    if (Number.isNaN(v) || (v !== null && v < 0)) {
      url.searchParams.set("error", `Valore non valido: ${k}`);
      return NextResponse.redirect(url, 303);
    }
  }
  const annual: CarSettings["annual"] = {};
  if (fields.assicurazione) annual.assicurazione = fields.assicurazione;
  if (fields.bollo) annual.bollo = fields.bollo;
  if (fields.manutenzione) annual.manutenzione = fields.manutenzione;
  const loanId = String(form.get("loanId") ?? "").slice(0, 64) || null;
  await saveCarSettings({ loanId, annual, kmYear: fields.km ? Math.round(fields.km) : null });
  url.searchParams.set("ok", "1");
  return NextResponse.redirect(url, 303);
}

import { NextResponse, type NextRequest } from "next/server";
import { getDeduction, removeDeduction, saveDeduction } from "@/lib/deductions-store";
import { parseNumber } from "@/lib/parse";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Spese 730: includi/escludi una spesa trovata, aggiungine una a mano, togli quelle aggiunte a mano. */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const action = String(form.get("action") ?? "");
  const year = String(form.get("year") ?? "");
  const id = String(form.get("id") ?? "");
  const back = (y: string, params: Record<string, string> = {}) => {
    const url = new URL("/730", request.url);
    if (/^\d{4}$/.test(y)) url.searchParams.set("anno", y);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return NextResponse.redirect(url, 303);
  };

  if (action === "toggle" || action === "delete") {
    const d = /^\d{4}$/.test(year) && id ? await getDeduction(year, id) : null;
    if (!d) return back(year, { error: "Spesa non trovata" });
    if (action === "delete" && d.source === "manuale") await removeDeduction(year, id);
    else await saveDeduction({ ...d, excluded: !d.excluded });
    return back(year);
  }

  if (action === "add") {
    const date = String(form.get("date") ?? "");
    const party = String(form.get("party") ?? "").trim().slice(0, 80);
    const amount = parseNumber(form.get("amount"));
    const type = form.get("type") === "veterinaria" ? "veterinaria" : "sanitaria";
    if (!DATE_RE.test(date) || Number.isNaN(Date.parse(date))) return back(year, { error: "Data non valida" });
    if (!party) return back(date.slice(0, 4), { error: "Scrivi a chi hai pagato" });
    if (amount === null || Number.isNaN(amount) || amount <= 0) return back(date.slice(0, 4), { error: "Importo non valido" });
    await saveDeduction({ id: `m:${crypto.randomUUID()}`, date, amount, party, type, source: "manuale", excluded: false });
    return back(date.slice(0, 4), { ok: "1" });
  }
  return back(year, { error: "Azione non valida" });
}

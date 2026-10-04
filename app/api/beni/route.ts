import { NextResponse, type NextRequest } from "next/server";
import { CATEGORIES, getPossession, removePossession, savePossession, type Category } from "@/lib/beni";
import { parseNumber } from "@/lib/parse";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function back(request: NextRequest, params: Record<string, string> = {}) {
  const url = new URL("/beni", request.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const action = String(form.get("action") ?? "save");
  const id = String(form.get("id") ?? "").trim();

  if (action === "delete") {
    if (id) await removePossession(id);
    return back(request);
  }

  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  const category = String(form.get("category") ?? "Altro") as Category;
  const value = parseNumber(form.get("value"));
  const purchasePrice = parseNumber(form.get("purchasePrice"));
  const purchaseDate = String(form.get("purchaseDate") ?? "").trim() || null;
  const note = String(form.get("note") ?? "").trim().slice(0, 300) || null;

  if (!name) return back(request, { error: "Scrivi il nome del bene" });
  if (!CATEGORIES.includes(category)) return back(request, { error: "Categoria non valida" });
  if (value === null || Number.isNaN(value) || value < 0) return back(request, { error: "Valore attuale non valido" });
  if (Number.isNaN(purchasePrice) || (purchasePrice !== null && purchasePrice < 0)) return back(request, { error: "Prezzo d’acquisto non valido" });
  if (purchaseDate && (!DATE_RE.test(purchaseDate) || Number.isNaN(Date.parse(purchaseDate)))) return back(request, { error: "Data d’acquisto non valida" });

  const existing = id ? await getPossession(id) : null;
  await savePossession({
    id: existing?.id ?? crypto.randomUUID(),
    name,
    category,
    value,
    purchasePrice,
    purchaseDate,
    note,
    updatedAt: new Date().toISOString(),
  });
  return back(request);
}

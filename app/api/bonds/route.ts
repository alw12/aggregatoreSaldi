import { NextResponse, type NextRequest } from "next/server";
import { getBond, removeBond, saveBond } from "@/lib/bonds";
import { parseNumber } from "@/lib/parse";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function back(request: NextRequest, params: Record<string, string> = {}) {
  const url = new URL("/buoni", request.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const action = String(form.get("action") ?? "save");
  const id = String(form.get("id") ?? "").trim();

  if (action === "delete") {
    if (id) await removeBond(id);
    return back(request);
  }

  const name = String(form.get("name") ?? "").trim() || "Buono fruttifero postale";
  const subscribedAt = String(form.get("subscribedAt") ?? "").trim();
  const capital = parseNumber(form.get("capital"));
  const grossRate = parseNumber(form.get("grossRate"));
  const maturityYears = parseNumber(form.get("maturityYears"));
  const manualValue = parseNumber(form.get("manualValue"));

  if (capital === null || Number.isNaN(capital) || capital <= 0) return back(request, { error: "Importo sottoscritto non valido" });
  if (!DATE_RE.test(subscribedAt) || Number.isNaN(Date.parse(subscribedAt))) return back(request, { error: "Data di sottoscrizione non valida" });
  if (new Date(subscribedAt).getTime() > Date.now()) return back(request, { error: "La data di sottoscrizione è nel futuro" });
  if (Number.isNaN(grossRate) || (grossRate !== null && (grossRate < 0 || grossRate > 20))) return back(request, { error: "Tasso non valido (in %, es. 3,25)" });
  if (Number.isNaN(maturityYears) || (maturityYears !== null && (maturityYears <= 0 || !Number.isInteger(maturityYears)))) return back(request, { error: "Durata non valida (anni interi)" });
  if (Number.isNaN(manualValue) || (manualValue !== null && manualValue < 0)) return back(request, { error: "Valore attuale non valido" });

  const existing = id ? await getBond(id) : null;
  await saveBond({
    id: existing?.id ?? crypto.randomUUID(),
    name,
    capital,
    subscribedAt,
    grossRate,
    maturityYears,
    manualValue,
    updatedAt: new Date().toISOString(),
  });
  return back(request);
}

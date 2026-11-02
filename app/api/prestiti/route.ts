import { NextResponse, type NextRequest } from "next/server";
import { removeLoan, saveLoan } from "@/lib/loans";
import { parseNumber } from "@/lib/number";

function back(request: NextRequest, params: Record<string, string> = {}) {
  const url = new URL("/prestiti", request.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url, 303);
}

const positive = (n: number | null): n is number => n !== null && n > 0;

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const id = String(form.get("id") ?? "").trim();
  if (!id) return back(request, { error: "Inserisci un nome" });

  if (form.get("action") === "delete") {
    await removeLoan(id);
    return back(request);
  }

  const principal = parseNumber(form.get("principal"));
  const installment = parseNumber(form.get("installment"));
  const count = parseNumber(form.get("count"));
  const firstDue = String(form.get("firstDue") ?? "");
  if (!positive(principal)) return back(request, { error: "Importo finanziato non valido" });
  if (!positive(installment)) return back(request, { error: "Rata non valida" });
  if (!positive(count) || !Number.isInteger(count)) return back(request, { error: "Numero di rate non valido" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDue)) return back(request, { error: "Data della prima rata non valida" });

  await saveLoan({ id, principal, installment, count, firstDue, updatedAt: new Date().toISOString() });
  return back(request);
}

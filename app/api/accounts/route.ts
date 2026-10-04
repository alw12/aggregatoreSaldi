import { NextResponse, type NextRequest } from "next/server";
import { getManualAccount, removeManualAccount, saveManualAccount } from "@/lib/manual";
import { parseNumber } from "@/lib/parse";

function back(request: NextRequest, params: Record<string, string> = {}) {
  const url = new URL("/conti", request.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url, 303);
}

function validCurrency(c: string): boolean {
  if (!/^[A-Z]{3}$/.test(c)) return false;
  try {
    new Intl.NumberFormat("it-IT", { style: "currency", currency: c });
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const action = String(form.get("action") ?? "save");
  const id = String(form.get("id") ?? "").trim();

  if (action === "delete") {
    if (id) await removeManualAccount(id);
    return back(request);
  }

  const name = String(form.get("name") ?? "").trim();
  const currency = String(form.get("currency") ?? "").trim().toUpperCase() || "EUR";
  const amount = parseNumber(form.get("amount"));

  if (!name) return back(request, { error: "Inserisci un nome per il conto" });
  if (!validCurrency(currency)) return back(request, { error: "Valuta non valida (codice a 3 lettere, es. EUR)" });
  if (amount === null || Number.isNaN(amount)) return back(request, { error: "Saldo non valido" });

  const existing = id ? await getManualAccount(id) : null;
  await saveManualAccount({
    id: existing?.id ?? crypto.randomUUID(),
    name,
    currency,
    amount,
    updatedAt: new Date().toISOString(),
  });
  return back(request);
}

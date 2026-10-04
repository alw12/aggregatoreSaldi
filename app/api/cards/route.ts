import { NextResponse, type NextRequest } from "next/server";
import { getCard, removeCard, saveCard } from "@/lib/cards";
import { parseNumber } from "@/lib/parse";

function back(request: NextRequest, params: Record<string, string> = {}) {
  const url = new URL("/carte", request.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const action = String(form.get("action") ?? "save");
  const id = String(form.get("id") ?? "").trim();

  if (action === "delete") {
    if (id) await removeCard(id);
    return back(request);
  }

  const name = String(form.get("name") ?? "").trim();
  const last4Raw = String(form.get("last4") ?? "").replace(/\s/g, "");
  const balance = parseNumber(form.get("balance"));
  const limit = parseNumber(form.get("limit"));
  const chargeDay = parseNumber(form.get("chargeDay"));

  if (!name) return back(request, { error: "Inserisci un nome per la carta" });
  // Solo le ultime 4 cifre: un numero completo non deve mai finire nello storage
  if (last4Raw && !/^\d{4}$/.test(last4Raw)) return back(request, { error: "Inserisci solo le ultime 4 cifre della carta" });
  if (balance === null || Number.isNaN(balance) || balance < 0) return back(request, { error: "Importo speso non valido" });
  if (Number.isNaN(limit) || (limit !== null && limit <= 0)) return back(request, { error: "Plafond non valido" });
  if (Number.isNaN(chargeDay) || (chargeDay !== null && (!Number.isInteger(chargeDay) || chargeDay < 1 || chargeDay > 31)))
    return back(request, { error: "Giorno di addebito non valido (1–31)" });

  const existing = id ? await getCard(id) : null;
  await saveCard({
    id: existing?.id ?? crypto.randomUUID(),
    name,
    last4: last4Raw || null,
    balance,
    limit,
    chargeDay,
    updatedAt: new Date().toISOString(),
  });
  return back(request);
}

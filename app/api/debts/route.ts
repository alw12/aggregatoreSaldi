import { NextResponse, type NextRequest } from "next/server";
import { getDebt, removeDebt, saveDebt } from "@/lib/debts";
import { parseNumber } from "@/lib/parse";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function back(request: NextRequest, params: Record<string, string> = {}) {
  const url = new URL("/debiti", request.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const action = String(form.get("action") ?? "save");
  const id = String(form.get("id") ?? "").trim();

  if (action === "delete") {
    if (id) await removeDebt(id);
    return back(request);
  }

  const name = String(form.get("name") ?? "").trim();
  const amount = parseNumber(form.get("amount"));
  const dueDate = String(form.get("dueDate") ?? "").trim() || null;
  const note = String(form.get("note") ?? "").trim().slice(0, 300) || null;

  if (!name) return back(request, { error: "Scrivi a chi o per cosa è il debito" });
  if (amount === null || Number.isNaN(amount) || amount < 0) return back(request, { error: "Importo non valido" });
  if (dueDate && (!DATE_RE.test(dueDate) || Number.isNaN(Date.parse(dueDate)))) return back(request, { error: "Scadenza non valida" });

  const existing = id ? await getDebt(id) : null;
  await saveDebt({
    id: existing?.id ?? crypto.randomUUID(),
    name,
    amount,
    dueDate,
    note,
    updatedAt: new Date().toISOString(),
  });
  return back(request);
}

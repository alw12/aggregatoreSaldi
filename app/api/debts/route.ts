import { NextResponse, type NextRequest } from "next/server";
import { getDebt, removeDebt, saveDebt } from "@/lib/debts";
import { parseNumber } from "@/lib/parse";
import { todayRome } from "@/lib/history";

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
  const rate = parseNumber(form.get("rate"));
  const installment = parseNumber(form.get("installment"));
  const wantsAutoPay = form.get("autoPay") === "on";

  if (!name) return back(request, { error: "Scrivi a chi o per cosa è il debito" });
  if (amount === null || Number.isNaN(amount) || amount < 0) return back(request, { error: "Importo non valido" });
  if (Number.isNaN(rate) || (rate !== null && (rate < 0 || rate > 100))) return back(request, { error: "TAEG non valido" });
  if (Number.isNaN(installment) || (installment !== null && installment < 0)) return back(request, { error: "Rata non valida" });
  if (wantsAutoPay && !installment) return back(request, { error: "Per scalare la rata in automatico serve la rata mensile" });
  if (dueDate && (!DATE_RE.test(dueDate) || Number.isNaN(Date.parse(dueDate)))) return back(request, { error: "Scadenza non valida" });

  const existing = id ? await getDebt(id) : null;
  // Contano le rate da oggi: l'importo appena scritto include già quelle passate.
  // I mesi già scalati restano, così una rata non viene tolta due volte
  const prev = existing?.autoPay ?? null;
  const today = todayRome();
  const autoPay = !wantsAutoPay
    ? null
    : prev
      ? { ...prev, since: existing!.amount !== amount || existing!.installment !== installment ? today : prev.since }
      : { since: today, paid: [], last: null };
  await saveDebt({
    id: existing?.id ?? crypto.randomUUID(),
    name,
    amount,
    dueDate,
    note,
    rate,
    installment: installment || null,
    autoPay,
    updatedAt: new Date().toISOString(),
  });
  return back(request);
}

import { NextResponse, type NextRequest } from "next/server";
import { CATEGORIES, type CategoryKey } from "@/lib/categories";
import { saveBudget } from "@/lib/budget-store";
import type { BudgetSettings } from "@/lib/budget";
import { parseNumber } from "@/lib/parse";

function back(request: NextRequest, params: Record<string, string> = {}) {
  const url = new URL("/budget", request.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url, 303);
}

/** Obiettivo di risparmio e tetti per categoria: campo vuoto o 0 = nessun limite. */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const goal = parseNumber(form.get("goal"));
  if (Number.isNaN(goal) || (goal !== null && goal < 0)) return back(request, { error: "Obiettivo non valido" });
  const limits: BudgetSettings["limits"] = {};
  for (const key of Object.keys(CATEGORIES) as CategoryKey[]) {
    const v = parseNumber(form.get(`limit_${key}`));
    if (Number.isNaN(v) || (v !== null && v < 0)) return back(request, { error: `Budget non valido per ${CATEGORIES[key].label}` });
    if (v) limits[key] = Math.round(v * 100) / 100;
  }
  await saveBudget({ goal: goal || null, limits });
  return back(request, { ok: "1" });
}

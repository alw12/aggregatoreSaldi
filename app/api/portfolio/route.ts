import { NextResponse, type NextRequest } from "next/server";
import { getHolding, removeHolding, resolveSymbol, saveHolding } from "@/lib/portfolio";

/** Accetta numeri all'italiana ("1.234,56") o all'inglese ("1234.56"). */
function parseNumber(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "").trim().replace(/\s|€/g, "");
  if (!s) return null;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

function back(request: NextRequest, params: Record<string, string> = {}) {
  const url = new URL("/portfolio", request.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const action = String(form.get("action") ?? "save");
  const id = String(form.get("id") ?? "").trim().toUpperCase();
  if (!id) return back(request, { error: "Inserisci un ISIN o un simbolo" });

  if (action === "delete") {
    await removeHolding(id);
    return back(request);
  }

  const qty = parseNumber(form.get("qty"));
  const manualPrice = parseNumber(form.get("manualPrice"));
  if (qty === null || Number.isNaN(qty) || qty < 0) return back(request, { error: "Quantità non valida" });
  if (Number.isNaN(manualPrice)) return back(request, { error: "Prezzo manuale non valido" });

  const existing = await getHolding(id);
  let symbol = existing?.symbol ?? null;
  let name = existing?.name ?? id;
  let warning: string | undefined;
  if (!symbol) {
    try {
      ({ symbol, name } = await resolveSymbol(id));
    } catch (e) {
      if (manualPrice === null) {
        return back(request, {
          error: `${e instanceof Error ? e.message : e}. Inserisci un simbolo Yahoo (es. SPYI.DE, BTC-EUR) oppure un prezzo manuale.`,
        });
      }
      warning = "Prezzo live non trovato: uso il prezzo manuale.";
    }
  }
  const label = String(form.get("name") ?? "").trim();

  await saveHolding({
    id,
    symbol,
    name: label || name,
    qty,
    manualPrice,
    updatedAt: new Date().toISOString(),
  });
  return back(request, warning ? { warning } : { ok: id });
}

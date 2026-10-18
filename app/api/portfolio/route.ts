import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_BROKER, getHolding, isAssetClass, isBroker, listHoldings, removeHolding, resolveSymbol, saveHolding, syncBroker, type Broker, type SyncPosition } from "@/lib/portfolio";
import { parseNumber } from "@/lib/parse";

function back(request: NextRequest, params: Record<string, string> = {}) {
  const url = new URL("/portfolio", request.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const action = String(form.get("action") ?? "save");
  const id = String(form.get("id") ?? "").trim().toUpperCase();
  const brokerField = form.get("broker") ?? DEFAULT_BROKER;
  if (!isBroker(brokerField)) return back(request, { error: "Broker non valido" });
  const broker = brokerField;
  if (action === "import") return importPositions(request, form, broker);
  if (!id) return back(request, { error: "Inserisci un ISIN o un simbolo", broker });

  if (action === "delete") {
    await removeHolding(broker, id);
    return back(request, { broker });
  }

  const qty = parseNumber(form.get("qty"));
  const manualPrice = parseNumber(form.get("manualPrice"));
  const avgCost = parseNumber(form.get("avgCost"));
  const assetClassField = form.get("assetClass");
  if (qty === null || Number.isNaN(qty) || qty < 0) return back(request, { error: "Quantità non valida", broker });
  if (Number.isNaN(manualPrice)) return back(request, { error: "Prezzo manuale non valido", broker });
  if (Number.isNaN(avgCost) || (avgCost !== null && avgCost < 0)) return back(request, { error: "Prezzo medio di carico non valido", broker });

  const existing = await getHolding(broker, id);
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
          broker,
        });
      }
      warning = "Prezzo live non trovato: uso il prezzo manuale.";
    }
  }
  const label = String(form.get("name") ?? "").trim();

  await saveHolding({
    id,
    broker,
    symbol,
    name: label || name,
    qty,
    manualPrice,
    // Campo vuoto = tieni quello già salvato (es. arrivato dalla sincronizzazione)
    avgCost: avgCost ?? existing?.avgCost ?? null,
    assetClass: isAssetClass(assetClassField) ? assetClassField : null,
    updatedAt: new Date().toISOString(),
  });
  return back(request, warning ? { warning, broker } : { ok: id, broker });
}

const ID_RE = /^([A-Z]{2}[A-Z0-9]{9}\d|[A-Z]{2,5}-EUR)$/;

/** Elenco incollato (già letto da lib/import.ts nel browser): ricontrollato qui prima di salvare. */
async function importPositions(request: NextRequest, form: FormData, broker: Broker) {
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("positions") ?? "[]"));
  } catch {
    return back(request, { error: "Elenco non valido", broker });
  }
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 200) return back(request, { error: "Nessuna posizione da importare", broker });
  const incoming: SyncPosition[] = [];
  for (const p of raw as Record<string, unknown>[]) {
    const id = typeof p?.id === "string" ? p.id.trim().toUpperCase() : "";
    const qty = Number(p?.qty);
    const avgCost = p?.avgCost == null ? null : Number(p.avgCost);
    if (!ID_RE.test(id) || !Number.isFinite(qty) || qty <= 0 || (avgCost !== null && !(Number.isFinite(avgCost) && avgCost >= 0))) {
      return back(request, { error: `Posizione non valida: ${id || "?"}`, broker });
    }
    incoming.push({ id, qty, avgCost, name: typeof p.name === "string" && p.name ? p.name.slice(0, 120) : undefined });
  }
  // "Aggiungi o aggiorna": le posizioni del broker non in elenco restano com'erano
  const keep =
    form.get("mode") === "replace"
      ? []
      : (await listHoldings())
          .filter((h) => h.broker === broker && !incoming.some((p) => p.id === h.id))
          .map((h): SyncPosition => ({ id: h.id, qty: h.qty, avgCost: h.avgCost ?? null, price: h.manualPrice }));
  const { saved, removed } = await syncBroker(broker, [...keep, ...incoming]);
  return back(request, { warning: `Importate ${incoming.length} posizioni su ${broker}${removed ? `, tolte ${removed}` : ""} (${saved} in totale).`, broker });
}

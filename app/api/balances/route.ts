import { NextResponse, type NextRequest } from "next/server";
import { getCard, saveCard } from "@/lib/cards";
import { clearOverride, getManualAccount, saveManualAccount, setOverride } from "@/lib/manual";
import { listSessions } from "@/lib/store";
import { parseNumber } from "@/lib/parse";

/** Pagina a cui tornare: solo percorsi interni, così il redirect non può portare fuori dal sito. */
function target(raw: FormDataEntryValue | null): string {
  const next = String(raw ?? "");
  return /^\/[\w\-/]*$/.test(next) && !next.startsWith("//") ? next : "/";
}

/** Aggiornamento rapido di un saldo dalla dashboard: conto PSD2, conto manuale o carta. */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const next = target(form.get("next"));
  const home = (req: NextRequest, error?: string) => {
    const url = new URL(next, req.url);
    if (error) url.searchParams.set("error", error);
    return NextResponse.redirect(url, 303);
  };
  const kind = String(form.get("kind") ?? "");
  const action = String(form.get("action") ?? "set");
  const id = String(form.get("id") ?? "").trim();
  if (!id) return home(request, "Elemento non trovato");

  if (kind === "account") {
    // Accetta solo uid di conti davvero collegati
    const known = (await listSessions()).some((s) => s.accounts.some((a) => a.uid === id));
    if (!known) return home(request, "Conto non trovato");
    if (action === "clear") {
      await clearOverride(id);
      return home(request);
    }
  }

  if (kind === "card" && action === "zero") {
    const card = await getCard(id);
    if (!card) return home(request, "Carta non trovata");
    await saveCard({ ...card, balance: 0, updatedAt: new Date().toISOString() });
    return home(request);
  }

  const amount = parseNumber(form.get("amount"));
  if (amount === null || Number.isNaN(amount)) return home(request, "Importo non valido");

  switch (kind) {
    case "account":
      await setOverride(id, amount);
      break;
    case "manual": {
      const acc = await getManualAccount(id);
      if (!acc) return home(request, "Conto non trovato");
      await saveManualAccount({ ...acc, amount, updatedAt: new Date().toISOString() });
      break;
    }
    case "card": {
      const card = await getCard(id);
      if (!card) return home(request, "Carta non trovata");
      if (amount < 0) return home(request, "Lo speso della carta non può essere negativo");
      await saveCard({ ...card, balance: amount, updatedAt: new Date().toISOString() });
      break;
    }
    default:
      return home(request, "Richiesta non valida");
  }
  return home(request);
}

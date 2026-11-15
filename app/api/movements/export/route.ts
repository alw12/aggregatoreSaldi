import { type NextRequest } from "next/server";
import { psuHeadersFrom } from "@/lib/data";
import { loadMovements } from "@/lib/transactions";
import { listDebts } from "@/lib/debts";
import { loadCatOpts } from "@/lib/cat-store";
import { CATEGORIES, categorize } from "@/lib/categories";
import { todayRome } from "@/lib/history";

const KIND = { in: "entrata", out: "uscita", invest: "messo da parte", internal: "giroconto" } as const;

/** Campo CSV: tra virgolette se contiene separatore, virgolette o a capo. */
const cell = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Tutti i movimenti letti (ultimi ~4 mesi) in CSV con `;`, come lo apre Excel in italiano. Protetto dal login (proxy.ts). */
export async function GET(request: NextRequest) {
  const [{ moves }, debts] = await Promise.all([loadMovements(psuHeadersFrom(request.headers)), listDebts().catch(() => [])]);
  const cat = await loadCatOpts(debts);
  const rows = [
    ["data", "importo", "valuta", "controparte", "conto", "tipo", "categoria"],
    ...moves.map((m) => [
      m.date,
      m.amount.toFixed(2).replace(".", ","),
      m.currency,
      m.party,
      m.account,
      KIND[m.kind],
      m.kind === "out" ? CATEGORIES[categorize(m, cat)].label : "",
    ]),
  ];
  // BOM: Excel riconosce l'UTF-8 (accenti) solo con il BOM
  const csv = "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="movimenti-${todayRome()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

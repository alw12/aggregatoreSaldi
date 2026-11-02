import { NextResponse, type NextRequest } from "next/server";
import { requestBalanceRefresh } from "@/lib/store";
import { clearPriceCache } from "@/lib/portfolio";
import { clearMovementsCache } from "@/lib/transactions";

/** Chiede di rileggere saldi, svuota la cache di prezzi e movimenti e torna alla dashboard, che rileggerà dalle banche. */
export async function POST(request: NextRequest) {
  await Promise.all([requestBalanceRefresh(), clearPriceCache(), clearMovementsCache()]);
  return NextResponse.redirect(new URL("/", request.url), 303);
}

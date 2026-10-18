import { NextResponse, type NextRequest } from "next/server";
import { clearBalanceCache } from "@/lib/store";
import { clearPriceCache } from "@/lib/portfolio";
import { clearMovementsCache } from "@/lib/transactions";

/** Svuota la cache di saldi, prezzi e movimenti e torna alla dashboard, che rileggerà dalle banche. */
export async function POST(request: NextRequest) {
  await Promise.all([clearBalanceCache(), clearPriceCache(), clearMovementsCache()]);
  return NextResponse.redirect(new URL("/", request.url), 303);
}

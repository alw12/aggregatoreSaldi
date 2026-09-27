import { NextResponse, type NextRequest } from "next/server";
import { clearBalanceCache } from "@/lib/store";
import { clearPriceCache } from "@/lib/portfolio";

/** Svuota la cache dei saldi e torna alla dashboard, che rileggerà dalle banche. */
export async function POST(request: NextRequest) {
  await Promise.all([clearBalanceCache(), clearPriceCache()]);
  return NextResponse.redirect(new URL("/", request.url), 303);
}

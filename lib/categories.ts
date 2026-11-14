/** Categorie di spesa riconosciute dal nome della controparte: logica pura (testata in categories.test.ts). */

import type { Movement } from "./flows";
import { isInstallment } from "./loan-payments";

export type CategoryKey = "rate" | "casa" | "abbonamenti" | "spesa" | "ristoranti" | "trasporti" | "salute" | "shopping" | "altro";

/** `color` è fisso per categoria (--c1…--c8, 0 = grigio): il colore segue la voce, non la posizione nel grafico. */
export const CATEGORIES: Record<CategoryKey, { label: string; color: number }> = {
  spesa: { label: "Spesa", color: 1 },
  ristoranti: { label: "Ristoranti e bar", color: 2 },
  trasporti: { label: "Trasporti e auto", color: 3 },
  casa: { label: "Casa e bollette", color: 4 },
  abbonamenti: { label: "Abbonamenti", color: 5 },
  salute: { label: "Salute e cura", color: 6 },
  shopping: { label: "Shopping", color: 7 },
  rate: { label: "Rate e prestiti", color: 8 },
  altro: { label: "Altro", color: 0 },
};

// L'ordine conta: "Eni Plenitude" è una bolletta, non benzina; "Amazon Prime" un abbonamento, non shopping
const RULES: [CategoryKey, RegExp][] = [
  ["rate", /finanziament|prestito|\brata\b|\brate\b|mutuo|agos|findomestic|compass|cofidis|santander|fca ?bank|ca auto ?bank|stellantis fin|volkswagen (bank|fin)|bmw bank|mercedes.?benz (bank|fin)|toyota fin|renault (bank|fin)|ycredit|klarna|scalapay|pagodil/i],
  ["casa", /\benel\b|\ba2a\b|\biren\b|\bhera\b|edison|\be\.?on\b|sorgenia|\bacea\b|illumia|octopus|plenitude|servizio elettrico|acquedott|\btari\b|condomin|affitto|locazion|\btim\b|telecom|vodafone|wind ?tre|iliad|fastweb|ho\.? ?mobile|very mobile|\bkena\b|\bsky\b|linkem|eolo\b/i],
  ["abbonamenti", /netflix|spotify|disney|prime video|amazon prime|apple\.com|itunes|icloud|google (one|storage|play)|youtube|\bdazn\b|now ?tv|chatgpt|openai|anthropic|claude\.ai|patreon|xbox|playstation|nintendo|audible|microsoft|adobe|dropbox|palestra|\bgym\b|fitness|mcfit|virgin active/i],
  ["spesa", /esselunga|\bcoop\b|conad|carrefour|\blidl\b|eurospin|\bpam\b|despar|\baldi\b|\bpenny\b|\bmd\b|\biper|tigros|bennet|famila|\bsimply\b|\bcrai\b|todis|naturasi|supermerc|\bmarket\b|alimentari|\bsigma\b|\bunes\b|il gigante|panific|macelleri|ortofrutt|\bdok\b|\bdeco\b|in'?s mercato/i],
  ["ristoranti", /ristorant|pizzeri|trattoria|osteria|\bbar\b|caff[eè]|pasticceri|gelateri|sushi|kebab|burger|mc ?donald|\bkfc\b|starbucks|autogrill|deliveroo|glovo|just ?eat|uber ?eats|\bpoke\b|bistrot|\bpub\b|birreri|tavola calda|rosticceri|piadineri/i],
  ["trasporti", /\beni\b|enilive|\bq8|tamoil|\besso\b|\bshell\b|repsol|carburant|benzin|distributor|autostrad|telepass|parchegg|easypark|trenitalia|\bitalo\b|\batac\b|\bgtt\b|\buber\b|free ?now|\bbolt\b|\btaxi\b|ryanair|easyjet|wizz|ita airways|flixbus|\blime\b|assicurazion|\brca\b|officina|meccanic|gommist|revisione/i],
  ["salute", /farmaci|parafarm|medic|ospedal|clinic|dentist|ottic|analisi|\basl\b|ticket sanit|poliambulat|fisioterap|veterinar|barbier|parrucch|estetist/i],
  ["shopping", /amazon|amzn|zalando|shein|\btemu\b|aliexpress|\bebay\b|\bikea\b|decathlon|mediaworld|unieuro|euronics|\bzara\b|h ?& ?m\b|primark|\bovs\b|uniqlo|\bnike\b|adidas|foot ?locker|sephora|douglas|mondadori|feltrinelli|apple store|leroy merlin|brico|vinted|paypal/i],
];

/** Categoria di un'uscita; `installments` sono le rate dei debiti, riconosciute dall'importo. */
export function categorize(m: Pick<Movement, "party" | "amount" | "currency">, installments: number[] = []): CategoryKey {
  if (installments.some((i) => isInstallment(m as Movement, i))) return "rate";
  for (const [key, re] of RULES) if (re.test(m.party)) return key;
  return "altro";
}

export type CategoryTotal = { key: CategoryKey; label: string; color: number; total: number; moves: Movement[] };

/** Uscite (solo EUR, senza giroconti né soldi messi da parte) per categoria tra `since` e `until` inclusi, dalla più grande. */
export function spendingByCategory(moves: Movement[], since: string, until: string, installments: number[] = []): CategoryTotal[] {
  const map = new Map<CategoryKey, CategoryTotal>();
  for (const m of moves) {
    if (m.kind !== "out" || m.currency !== "EUR" || m.date < since || m.date > until) continue;
    const key = categorize(m, installments);
    const cur = map.get(key) ?? { key, ...CATEGORIES[key], total: 0, moves: [] };
    cur.total -= m.amount;
    cur.moves.push(m);
    map.set(key, cur);
  }
  // "Altro" sempre in fondo: non è una categoria da confrontare con le altre
  return [...map.values()].sort((a, b) => (a.key === "altro" ? 1 : b.key === "altro" ? -1 : b.total - a.total));
}

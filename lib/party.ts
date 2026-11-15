/** Nomi delle controparti: versione leggibile e chiave stabile tra un movimento e l'altro (testate in party.test.ts). */

/**
 * Nome leggibile dalla descrizione della banca: via "PAGAMENTO POS", data e ora, numero di operazione,
 * carta, codici del mandato SEPA. Le descrizioni tutte maiuscole diventano Maiuscole Iniziali.
 */
export function displayParty(party: string): string {
  let s = party
    .replace(/^(pagamento pos|domiciliazione \(addebito diretto sepa\)|addebito diretto sepa|postagiro a|bonifico a favore di|bonifico a)\s+/i, "")
    .replace(/\s+(\d{2}\/\d{2}\/\d{2,4}|cid\.|op\.|carta\b|man\.|trn\b|mndt).*$/i, "")
    .replace(/^www\./i, "")
    .trim();
  if (s && s === s.toUpperCase()) s = s.toLowerCase().replace(/(^|[\s(])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
  return s || party;
}

// Parole di servizio delle banche che non distinguono chi incassa
const NOISE = new Set(["pagamento", "pag", "pos", "addebito", "addebiti", "diretto", "sdd", "sepa", "carta", "bonifico", "favore", "disposizione", "vs", "presso", "ricorrente", "del", "di", "a", "op", "www", "srl", "spa", "s", "r", "l", "p"]);

/**
 * Chiave della controparte: minuscole, senza codici (le parole con cifre: numero d'ordine, punto vendita,
 * data) e senza parole di servizio. "Amazon* B83ak5op4" e "Amazon* Nk1oh9mi4" → "amazon";
 * "Mc Donald S 14" → "mc donald".
 */
export function partyKey(party: string): string {
  return displayParty(party)
    .toLowerCase()
    .split(/[^\p{L}\p{N}&]+/u)
    .filter((w) => w && !/\d/.test(w) && !NOISE.has(w))
    .join(" ")
    .slice(0, 40);
}

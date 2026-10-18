/**
 * Accetta numeri all'italiana ("1.234,56", "2.064") o all'inglese ("1234.56").
 * Senza virgola, un punto seguito da gruppi di esattamente 3 cifre è il
 * separatore delle migliaia ("2.064" = 2064); altrimenti è il decimale ("0.5", "0.315").
 */
export function parseNumber(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "").trim().replace(/\s|€|%/g, "");
  if (!s) return null;
  let normalized: string;
  if (s.includes(",")) normalized = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) normalized = s.replace(/\./g, "");
  else normalized = s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

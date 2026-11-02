/** Accetta numeri all'italiana ("1.234,56") o all'inglese ("1234.56"). */
export function parseNumber(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "").trim().replace(/\s|€/g, "");
  if (!s) return null;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

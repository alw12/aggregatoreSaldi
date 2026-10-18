import type { Overview } from "./overview";

/** Qualcosa da sistemare: mostrato in panoramica e inviato come notifica dal job giornaliero. */
export type Alert = {
  key: string; // stabile finché la situazione non cambia: evita di notificare due volte la stessa cosa
  level: "warn" | "error";
  text: string;
  href: string;
};

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(n);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "long", timeZone: "UTC" });
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export const CARD_THRESHOLD = 0.8;

export function computeAlerts(o: Overview, today: string): Alert[] {
  const out: Alert[] = [];

  for (const b of o.banks) {
    if (b.expired) out.push({ key: `consent-expired:${b.sessionId}`, level: "error", text: `Il consenso di ${b.bank} è scaduto: ricollega la banca.`, href: "/connect" });
    else if (b.daysLeft <= 14)
      out.push({
        key: `consent:${b.sessionId}:${b.daysLeft <= 3 ? "3" : "14"}`,
        level: b.daysLeft <= 3 ? "error" : "warn",
        text: `Il consenso di ${b.bank} scade ${b.daysLeft === 0 ? "oggi" : `tra ${b.daysLeft} ${b.daysLeft === 1 ? "giorno" : "giorni"}`}: ricollegala per non perdere l’accesso.`,
        href: "/connect",
      });
  }
  const unread = o.banks.filter((b) => !b.expired).flatMap((b) => b.accounts.filter((a) => a.amount === null).map((a) => `${b.bank} ${a.label}`));
  if (unread.length) out.push({ key: `unread:${today}`, level: "warn", text: `Non riesco a leggere ${unread.join(", ")}: il totale non lo include.`, href: "/" });

  for (const c of o.cards) {
    if (c.limit && c.balance / c.limit >= CARD_THRESHOLD)
      out.push({
        key: `card:${c.id}:${c.nextCharge ?? ""}`,
        level: c.balance >= c.limit ? "error" : "warn",
        text: `La carta ${c.name} è al ${Math.round((c.balance / c.limit) * 100)}% del plafond (${eur(c.balance)} su ${eur(c.limit)}).`,
        href: "/carte",
      });
  }
  const charges = o.cards.filter((c) => c.balance > 0 && c.nextCharge && daysBetween(today, c.nextCharge) <= 3 && daysBetween(today, c.nextCharge) >= 0);
  const charging = charges.reduce((s, c) => s + c.balance, 0);
  for (const c of charges)
    out.push({
      key: `charge:${c.id}:${c.nextCharge}`,
      level: o.totals.cash < charging ? "error" : "warn",
      text: `Il ${day(c.nextCharge!)} la carta ${c.name} addebita ${eur(c.balance)}${o.totals.cash < charging ? ": la liquidità non basta" : ""}.`,
      href: "/carte",
    });

  for (const d of o.debts) {
    if (!d.dueDate) continue;
    const left = daysBetween(today, d.dueDate);
    if (left < 0) out.push({ key: `debt-late:${d.id}:${d.dueDate}`, level: "error", text: `${d.name}: la scadenza del ${day(d.dueDate)} è passata.`, href: "/debiti" });
    else if (left <= 7)
      out.push({ key: `debt:${d.id}:${d.dueDate}`, level: "warn", text: `${d.name}: ${eur(d.amount)} da restituire entro il ${day(d.dueDate)}.`, href: "/debiti" });
  }

  for (const b of o.bonds) if (b.matured) out.push({ key: `bond:${b.id}`, level: "warn", text: `Il buono ${b.name} è scaduto: non frutta più, incassalo.`, href: "/buoni" });

  if (o.portfolioError) out.push({ key: `portfolio:${today}`, level: "warn", text: "Prezzi del portafoglio non disponibili al momento.", href: "/portfolio" });

  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
}

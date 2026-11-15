/** Cose strane tra le spese recenti: addebiti doppi, spese insolite, nuove ricorrenti, aumenti. Logica pura (anomalies.test.ts). */

import type { Movement } from "./flows";
import type { CatOpts } from "./categories";
import { recurringSpending } from "./budget";
import { displayParty, partyKey } from "./party";

export type Oddity = {
  key: string; // stabile: la stessa cosa non si notifica due volte
  kind: "doppio" | "insolita" | "nuova" | "ricorrente" | "aumento";
  text: string;
  party: string; // per il link alla controparte
  date: string;
};

/** Si segnalano solo i movimenti degli ultimi giorni: dopo una settimana non è più una novità. */
export const ODD_DAYS = 6;
const DOUBLE_MIN = 10; // sotto, due caffè uguali sono normali
const BIG_NEW = 250; // spesa verso qualcuno mai pagato prima
const UNUSUAL_RATIO = 2.5;
const UNUSUAL_MIN = 50; // al supermercato 40 € invece di 10 è normale

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(n);
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function findOddities(moves: Movement[], today: string, cat: CatOpts = {}): Oddity[] {
  const out: Oddity[] = [];
  const spend = moves.filter((m) => m.kind === "out" && m.currency === "EUR" && m.amount < 0 && m.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  if (!spend.length) return out;
  const firstData = moves.reduce((a, m) => (m.date < a ? m.date : a), today);
  const recent = (m: Movement) => days(m.date, today) <= ODD_DAYS;
  const byParty = new Map<string, Movement[]>();
  for (const m of spend) {
    const k = partyKey(m.party);
    if (k) byParty.set(k, [...(byParty.get(k) ?? []), m]);
  }
  // Parole principali già viste: la banca scrive lo stesso nome in modi diversi ("de anna" / "deanna")
  const mainWord = (k: string) => k.split(" ").find((w) => w.length >= 4) ?? k;
  const firstSeen = new Map<string, string>();
  for (const m of spend) {
    const w = mainWord(partyKey(m.party));
    if (!firstSeen.has(w)) firstSeen.set(w, m.date);
  }
  const installments = cat.installments ?? [];
  const isRate = (m: Movement) => installments.some((i) => Math.abs(-m.amount - i) < 0.005);

  for (const [key, list] of byParty) {
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (!recent(m)) continue;
      const amount = -m.amount;
      const name = displayParty(m.party);

      // Addebito doppio: stesso conto, stesso importo, a 0-2 giorni
      const twin = list.slice(0, i).find((p) => p.account === m.account && Math.abs(p.amount - m.amount) < 0.005 && days(p.date, m.date) <= 2);
      if (twin && amount >= DOUBLE_MIN) {
        out.push({ key: `odd:doppio:${m.id}`, kind: "doppio", party: m.party, date: m.date, text: `${name}: due addebiti uguali da ${eur(amount)} (${twin.date === m.date ? "lo stesso giorno" : "a pochi giorni"}). Controlla che non sia un doppione.` });
        continue;
      }
      if (isRate(m)) continue;
      const before = list.slice(0, i).map((p) => -p.amount);
      // Spesa insolita: molto più del solito con la stessa controparte
      if (before.length >= 3) {
        const usual = median(before);
        if (amount > usual * UNUSUAL_RATIO && amount - usual >= UNUSUAL_MIN)
          out.push({ key: `odd:insolita:${m.id}`, kind: "insolita", party: m.party, date: m.date, text: `${name}: ${eur(amount)}, di solito ${eur(usual)}.` });
      } else if (!before.length && amount >= BIG_NEW && days(firstData, m.date) > 30 && firstSeen.get(mainWord(key)) === m.date) {
        // Spesa grande verso qualcuno mai pagato prima (nei mesi letti)
        out.push({ key: `odd:nuova:${m.id}`, kind: "nuova", party: m.party, date: m.date, text: `Spesa di ${eur(amount)} a ${name}, mai pagato prima.` });
      }
    }

    // Aumento di prezzo: due addebiti mensili uguali, poi uno più caro
    const seq = list.filter((m, i) => !(i > 0 && Math.abs(list[i - 1].amount - m.amount) < 0.005 && days(list[i - 1].date, m.date) <= 3));
    if (seq.length >= 3) {
      const [a, b, c] = seq.slice(-3);
      const monthly = [days(a.date, b.date), days(b.date, c.date)].every((g) => g >= 20 && g <= 40);
      if (monthly && recent(c) && Math.abs(a.amount - b.amount) < 0.005 && -c.amount > -b.amount + 0.005 && -c.amount < -b.amount * 1.5)
        out.push({
          key: `odd:aumento:${c.id}`,
          kind: "aumento",
          party: c.party,
          date: c.date,
          text: `${displayParty(c.party)} è passato da ${eur(-b.amount)} a ${eur(-c.amount)} al mese.`,
        });
    }
  }

  // Nuova spesa ricorrente: è passata per la seconda volta e prima dei mesi letti non c'era
  for (const r of recurringSpending(moves, today, cat)) {
    if (r.months !== 2 || days(r.last, today) > ODD_DAYS || days(firstData, r.first) <= 35) continue;
    out.push({ key: `odd:ricorrente:${r.key}:${r.last}`, kind: "ricorrente", party: r.party, date: r.last, text: `Nuova spesa ricorrente: ${displayParty(r.party)}, ${eur(r.amount)} al mese.` });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

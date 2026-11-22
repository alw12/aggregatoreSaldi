import "server-only";
import type { Tool } from "./mcp";
import { loadOverview, changeSince, type Overview } from "./overview";
import { todayRome } from "./history";
import { computeAlerts } from "./alerts";
import { findOddities } from "./anomalies";
import { CATEGORIES, categorize, spendingByCategory, type CategoryKey, type CatOpts } from "./categories";
import { budgetLines, forecastMonth, recurringDue, recurringSpending, runway, displayParty } from "./budget";
import { monthReport, reportMonths } from "./report";
import { averageMonth, monthlyFlows, type Kind, type Movement } from "./flows";
import { byAssetClass, byInstrument } from "./portfolio";
import { payoff } from "./finance";
import { loadInflation, wealthImpact } from "./inflation";
import { deductionYears, listDeductions } from "./deductions-store";
import { summarizeDeductions } from "./deductions";
import { getCarSettings } from "./car-store";
import { EMPTY_CAR, carCost, guessCarLoan } from "./car";

/**
 * Gli strumenti del connettore di Claude: solo lettura, solo dati già salvati (mai una lettura dalle
 * banche), importi in EUR arrotondati al centesimo, date YYYY-MM-DD, IBAN mascherati.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const r2n = (n: number | null | undefined) => (n === null || n === undefined ? null : r2(n));
const maskIban = (iban?: string) => (iban ? `${iban.slice(0, 4)}…${iban.slice(-4)}` : null);
const DATE = "^\\d{4}-\\d{2}-\\d{2}$";
const MONTH = "^\\d{4}-\\d{2}$";
const CAT_KEYS = Object.keys(CATEGORIES) as CategoryKey[];
const catLabel = (k: CategoryKey) => CATEGORIES[k].label;
const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

const NO_PSU = { "Psu-Ip-Address": "127.0.0.1" };

/** I dati di una richiesta: la panoramica si carica una volta sola anche se servono più strumenti. */
function context() {
  let o: Promise<Overview> | null = null;
  const overview = () => (o ??= loadOverview(NO_PSU, { cacheOnly: true }));
  const catOpts = async (): Promise<CatOpts> => {
    const ov = await overview();
    return { installments: ov.debts.flatMap((d) => (d.installment ? [d.installment] : [])), rules: ov.catRules };
  };
  return { overview, catOpts, today: todayRome() };
}

/** Quanto indietro arrivano i movimenti salvati: le banche PSD2 danno 90-120 giorni. */
function coverage(moves: Movement[]) {
  if (!moves.length) return { dal: null, al: null, nota: "Nessun movimento salvato: apri Movimenti su Saldi per leggerli dalle banche." };
  return { dal: moves.at(-1)!.date, al: moves[0].date, nota: "Le banche danno solo gli ultimi 90-120 giorni di movimenti." };
}

function period(args: Record<string, unknown>, today: string) {
  const al = typeof args.al === "string" ? args.al : today;
  const dal = typeof args.dal === "string" ? args.dal : `${today.slice(0, 7)}-01`;
  if (dal > al) throw new Error(`"dal" (${dal}) è dopo "al" (${al})`);
  return { dal, al };
}

export function buildTools(): Tool[] {
  const ctx = context();

  return [
    {
      name: "riepilogo",
      title: "Riepilogo del patrimonio",
      description:
        "Patrimonio netto e sue parti (liquidità, investimenti, buoni, carte, debiti, beni), variazione a 7 e 30 giorni, mesi di autonomia, avvisi attivi e quando sono stati letti i conti. Il punto di partenza per qualsiasi domanda sui soldi.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: async () => {
        const o = await ctx.overview();
        const t = o.totals;
        const w = changeSince(o.days, 7);
        const m = changeSince(o.days, 30);
        const rw = runway(t.cash, t.cards, o.moves, ctx.today);
        return {
          oggi: ctx.today,
          patrimonio_netto: r2(t.net),
          patrimonio_con_beni: r2(t.netWithBeni),
          liquidita: r2(t.cash),
          investimenti: { totale: r2(t.invested), etf_crypto: r2(t.holdings), buoni_postali: r2(t.bonds), guadagno_noto: r2n(t.holdingsGain), costo_noto: r2n(t.holdingsCost) },
          carte_da_addebitare: r2(t.cards),
          debiti: r2(t.debts),
          beni: r2(t.beni),
          altre_valute: o.otherCurrencies.map(([valuta, importo]) => ({ valuta, importo: r2(importo) })),
          variazione_7_giorni: w ? { importo: r2(w.delta), dal: w.from } : null,
          variazione_30_giorni: m ? { importo: r2(m.delta), dal: m.from } : null,
          mesi_di_autonomia: rw ? { mesi: Math.round(rw.months * 10) / 10, spesa_media_mensile: r2(rw.monthly), liquidita_disponibile: r2(rw.available), mesi_usati: rw.basis } : null,
          avvisi: computeAlerts(o, ctx.today).map((a) => ({ livello: a.level, testo: a.text })),
          conti_letti: o.accountsCount,
          conti_non_letti: o.failed,
          lettura_piu_vecchia: o.oldestFetch,
          nota: "Il patrimonio netto è liquidità + investimenti − carte − debiti; i beni (auto, casa…) sono a parte.",
        };
      },
    },
    {
      name: "conti",
      title: "Conti e saldi",
      description: "Saldo di ogni conto bancario collegato (con data di lettura e scadenza del consenso PSD2) e dei conti inseriti a mano.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: async () => {
        const o = await ctx.overview();
        return {
          banche: o.banks.map((b) => ({
            banca: b.bank,
            letto: b.fetchedAt,
            consenso_scaduto: b.expired,
            giorni_al_rinnovo_consenso: b.daysLeft,
            conti: b.accounts.map((a) => ({
              nome: a.label,
              iban: maskIban(a.iban),
              valuta: a.currency,
              saldo: r2n(a.amount),
              errore: a.error ?? null,
              saldo_manuale_del: a.manualAt ?? null,
              banca_non_raggiungibile_dal: a.staleAt ?? null,
            })),
          })),
          conti_manuali: o.manual.map((a) => ({ nome: a.name, valuta: a.currency, saldo: r2(a.amount), aggiornato: a.updatedAt })),
        };
      },
    },
    {
      name: "movimenti",
      title: "Movimenti",
      description:
        "Elenco dei movimenti dei conti con filtri: periodo, categoria di spesa, tipo, testo nella controparte, conto. Importi con segno (− uscita, + entrata). Tipi: in = entrata, out = spesa, invest = soldi messi da parte (broker, buoni, salvadanai), internal = giroconti tra conti propri. Restituisce anche i totali del filtro.",
      inputSchema: {
        type: "object",
        properties: {
          dal: { type: "string", description: "Data iniziale YYYY-MM-DD (default: 90 giorni fa)", pattern: DATE },
          al: { type: "string", description: "Data finale YYYY-MM-DD compresa (default: oggi)", pattern: DATE },
          categoria: { type: "string", description: "Solo spese di questa categoria", enum: CAT_KEYS },
          tipo: { type: "string", description: "in, out, invest o internal", enum: ["in", "out", "invest", "internal"] },
          cerca: { type: "string", description: "Testo da cercare nella controparte o descrizione (senza maiuscole/minuscole)" },
          conto: { type: "string", description: "Testo da cercare nel nome della banca o del conto" },
          limite: { type: "integer", description: "Quanti movimenti al massimo (default 100)", minimum: 1, maximum: 500 },
        },
        additionalProperties: false,
      },
      run: async (args) => {
        const o = await ctx.overview();
        const cat = await ctx.catOpts();
        const al = (args.al as string) ?? ctx.today;
        const dal = (args.dal as string) ?? shift(ctx.today, -90);
        const q = typeof args.cerca === "string" ? args.cerca.toLowerCase() : null;
        const acc = typeof args.conto === "string" ? args.conto.toLowerCase() : null;
        const kind = args.tipo as Kind | undefined;
        const category = args.categoria as CategoryKey | undefined;
        const found = o.moves.filter((m) => {
          if (m.date < dal || m.date > al) return false;
          if (kind && m.kind !== kind) return false;
          if (q && !m.party.toLowerCase().includes(q) && !displayParty(m.party).toLowerCase().includes(q)) return false;
          if (acc && !m.account.toLowerCase().includes(acc)) return false;
          if (category && (m.kind !== "out" || categorize(m, cat) !== category)) return false;
          return true;
        });
        const limit = (args.limite as number) ?? 100;
        const eur = found.filter((m) => m.currency === "EUR");
        return {
          dati_disponibili: coverage(o.moves),
          trovati: found.length,
          mostrati: Math.min(limit, found.length),
          totale_entrate: r2(eur.filter((m) => m.amount > 0).reduce((s, m) => s + m.amount, 0)),
          totale_uscite: r2(-eur.filter((m) => m.amount < 0).reduce((s, m) => s + m.amount, 0)),
          movimenti: found.slice(0, limit).map((m) => ({
            data: m.date,
            importo: r2(m.amount),
            valuta: m.currency,
            controparte: displayParty(m.party),
            descrizione: m.party,
            conto: m.account,
            tipo: m.kind,
            categoria: m.kind === "out" ? catLabel(categorize(m, cat)) : null,
          })),
        };
      },
    },
    {
      name: "spese_per_categoria",
      title: "Spese per categoria",
      description:
        "Spese di un periodo divise per categoria (casa e bollette, spesa, ristoranti, trasporti, abbonamenti, salute, shopping, rate, altro), con le controparti principali e il confronto con il periodo precedente della stessa durata. Default: mese in corso fino a oggi.",
      inputSchema: {
        type: "object",
        properties: {
          dal: { type: "string", description: "Data iniziale YYYY-MM-DD (default: primo del mese)", pattern: DATE },
          al: { type: "string", description: "Data finale YYYY-MM-DD compresa (default: oggi)", pattern: DATE },
        },
        additionalProperties: false,
      },
      run: async (args) => {
        const o = await ctx.overview();
        const cat = await ctx.catOpts();
        const { dal, al } = period(args, ctx.today);
        const len = daysBetween(dal, al) + 1;
        const prevAl = shift(dal, -1);
        const prevDal = shift(prevAl, -(len - 1));
        const covered = o.moves.length > 0 && o.moves.at(-1)!.date <= prevDal;
        const now = spendingByCategory(o.moves, dal, al, cat);
        const before = covered ? new Map(spendingByCategory(o.moves, prevDal, prevAl, cat).map((c) => [c.key, c.total])) : null;
        return {
          periodo: { dal, al, giorni: len },
          periodo_precedente: covered ? { dal: prevDal, al: prevAl } : null,
          totale: r2(now.reduce((s, c) => s + c.total, 0)),
          totale_precedente: before ? r2([...before.values()].reduce((s, v) => s + v, 0)) : null,
          categorie: now.map((c) => {
            const parties = new Map<string, number>();
            for (const m of c.moves) parties.set(displayParty(m.party), (parties.get(displayParty(m.party)) ?? 0) - m.amount);
            return {
              categoria: c.label,
              chiave: c.key,
              totale: r2(c.total),
              movimenti: c.moves.length,
              periodo_precedente: before ? r2(before.get(c.key) ?? 0) : null,
              principali: [...parties.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([p, v]) => ({ controparte: p, totale: r2(v) })),
            };
          }),
          nota: covered ? null : "Il periodo precedente non è coperto per intero dai movimenti salvati: confronto omesso.",
        };
      },
    },
    {
      name: "budget",
      title: "Budget del mese",
      description:
        "Tetti di spesa per categoria con lo speso del mese e la spesa abituale, l'obiettivo di risparmio, la previsione di fine mese (entrate, uscite, risparmio) e gli addebiti ricorrenti ancora attesi questo mese.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: async () => {
        const o = await ctx.overview();
        const cat = await ctx.catOpts();
        const f = forecastMonth(o.moves, ctx.today);
        const due = recurringDue(recurringSpending(o.moves, ctx.today, cat), ctx.today);
        return {
          mese: ctx.today.slice(0, 7),
          tetti: budgetLines(o.moves, o.budget.limits, ctx.today, cat).map((l) => ({
            categoria: l.label,
            tetto: r2(l.limit),
            speso: r2(l.spent),
            percentuale: Math.round((l.spent / l.limit) * 100),
            abituale_al_mese: r2n(l.usual),
          })),
          obiettivo_risparmio_mensile: r2n(o.budget.goal),
          previsione_fine_mese:
            f.basis > 0
              ? {
                  giorni_rimasti: f.daysLeft,
                  entrate: { finora: r2(f.income.sofar), previste: r2(f.income.expected) },
                  uscite: { finora: r2(f.spending.sofar), previste: r2(f.spending.expected) },
                  messo_da_parte_finora: r2(f.invested),
                  risparmio_previsto: r2(f.saved),
                  mesi_usati_per_la_stima: f.basis,
                }
              : null,
          ricorrenti_ancora_attesi: due.map((d) => ({ controparte: displayParty(d.party), importo: r2(d.amount), previsto_il: d.next, categoria: catLabel(d.category) })),
        };
      },
    },
    {
      name: "spese_ricorrenti",
      title: "Spese ricorrenti",
      description: "Abbonamenti, bollette, rate e altre spese che tornano ogni mese, con ultimo importo, prossimo addebito previsto e totale mensile.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: async () => {
        const o = await ctx.overview();
        const rec = recurringSpending(o.moves, ctx.today, await ctx.catOpts());
        return {
          totale_mensile: r2(rec.reduce((s, x) => s + x.amount, 0)),
          spese: rec.map((x) => ({
            controparte: displayParty(x.party),
            importo: r2(x.amount),
            categoria: catLabel(x.category),
            volte: x.months,
            prima: x.first,
            ultima: x.last,
            prossima_prevista: x.next,
          })),
        };
      },
    },
    {
      name: "report_mese",
      title: "Report di un mese",
      description: "Report di un mese intero: entrate, spese, messo da parte, risparmio e tasso di risparmio, spese per categoria con il mese prima, le spese più grandi e se l'obiettivo è stato raggiunto.",
      inputSchema: {
        type: "object",
        properties: { mese: { type: "string", description: "Mese YYYY-MM (default: l'ultimo mese intero disponibile)", pattern: MONTH } },
        additionalProperties: false,
      },
      run: async (args) => {
        const o = await ctx.overview();
        const months = reportMonths(o.moves, ctx.today);
        const mese = (args.mese as string) ?? months[0];
        if (!mese) throw new Error("Non ci sono ancora mesi interi nei movimenti salvati.");
        if (!months.includes(mese)) throw new Error(`Report non disponibile per ${mese}. Mesi disponibili: ${months.join(", ") || "nessuno"}.`);
        const r = monthReport(o.moves, mese, ctx.today, await ctx.catOpts(), o.budget.goal);
        const tot = (x: typeof r.totals) => ({ entrate: r2(x.income), spese: r2(x.spending), messo_da_parte: r2(x.invested), risparmio: r2(x.saved), tasso_di_risparmio: x.rate === null ? null : Math.round(x.rate * 100) });
        return {
          mese: r.month,
          mesi_disponibili: months,
          totali: tot(r.totals),
          mese_prima: r.prev ? tot(r.prev) : null,
          categorie: r.categories.map((c) => ({ categoria: c.label, totale: r2(c.total), mese_prima: r2n(c.prev), movimenti: c.count })),
          spese_piu_grandi: r.biggest.map((b) => ({ data: b.date, controparte: displayParty(b.party), importo: r2(b.amount), categoria: catLabel(b.category) })),
          obiettivo: r.goal ? { importo: r2(r.goal.amount), raggiunto: r.goal.reached } : null,
        };
      },
    },
    {
      name: "flussi_mensili",
      title: "Entrate e uscite per mese",
      description: "Per ogni mese dei movimenti salvati: entrate, spese, messo da parte e risparmio, più la media dei mesi interi.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: async () => {
        const o = await ctx.overview();
        const flows = monthlyFlows(o.moves);
        const avg = averageMonth(flows, ctx.today.slice(0, 7));
        return {
          mesi: flows.map((f) => ({ mese: f.month, entrate: r2(f.income), spese: r2(f.spending), messo_da_parte: r2(f.invested), risparmio: r2(f.saved), tasso_di_risparmio: f.rate === null ? null : Math.round(f.rate * 100) })),
          media_mesi_interi: avg ? { entrate: r2(avg.income), spese: r2(avg.spending), risparmio: r2(avg.saved), mesi: avg.months } : null,
          nota: "Il mese in corso è parziale.",
        };
      },
    },
    {
      name: "portafoglio",
      title: "Investimenti",
      description: "Posizioni in ETF, oro e crypto (quote, valore, costo e guadagno se c'è il prezzo di carico, broker), ripartizione per tipo e buoni fruttiferi postali con valore e rendimento.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: async () => {
        const o = await ctx.overview();
        const t = o.totals;
        return {
          totale_etf_crypto: r2(t.holdings),
          errore_prezzi: o.portfolioError,
          posizioni: byInstrument(o.holdings).map((i) => ({
            nome: i.name,
            isin_o_simbolo: i.id,
            broker: [...new Set(i.brokers)],
            quote: i.qty,
            valore: r2(i.value),
            quota_del_portafoglio: t.holdings > 0 ? Math.round((i.value / t.holdings) * 1000) / 10 : null,
            costo: r2n(i.cost),
            guadagno: r2n(i.gain),
            guadagno_percentuale: i.gain !== null && i.cost ? Math.round((i.gain / i.cost) * 1000) / 10 : null,
          })),
          per_tipo: byAssetClass(o.holdings).map((c) => ({ tipo: c.label, valore: r2(c.value) })),
          buoni_postali: o.bonds.map((b) => ({
            nome: b.name,
            sottoscritto: r2(b.capital),
            dal: b.subscribedAt,
            valore_netto: r2(b.value),
            valore_da: b.valueSource,
            anni: b.yearsHeld,
            durata_massima_anni: b.maturityYears,
            scaduto: b.matured,
            tasso_lordo: b.grossRate,
          })),
          totale_buoni: r2(t.bonds),
        };
      },
    },
    {
      name: "debiti_e_carte",
      title: "Debiti e carte",
      description: "Debiti e prestiti (importo residuo, rata, TAEG, mesi e interessi che restano) e carte di credito (speso da addebitare, plafond, data di addebito).",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: async () => {
        const o = await ctx.overview();
        return {
          totale_debiti: r2(o.totals.debts),
          debiti: o.debts.map((d) => {
            const p = d.installment && d.rate !== null && d.rate !== undefined ? payoff(d.amount, d.installment, d.rate) : null;
            return {
              nome: d.name,
              residuo: r2(d.amount),
              rata_mensile: r2n(d.installment),
              taeg: d.rate ?? null,
              scadenza: d.dueDate,
              rata_scalata_in_automatico: !!d.autoPay,
              mesi_rimasti_stimati: p?.months ?? null,
              interessi_rimasti_stimati: p ? r2(p.interest) : null,
              nota: d.note,
            };
          }),
          totale_carte: r2(o.totals.cards),
          carte: o.cards.map((c) => ({ nome: c.name, ultime_cifre: c.last4, da_addebitare: r2(c.balance), plafond: r2n(c.limit), disponibile: r2n(c.available), prossimo_addebito: c.nextCharge })),
        };
      },
    },
    {
      name: "beni",
      title: "Beni",
      description: "Beni posseduti (auto, casa, elettronica…) con valore stimato, prezzo e data d'acquisto. Non entrano nel patrimonio netto.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: async () => {
        const o = await ctx.overview();
        return {
          totale: r2(o.totals.beni),
          beni: o.beni.map((p) => ({ nome: p.name, categoria: p.category, valore: r2(p.value), pagato: r2n(p.purchasePrice), acquistato_il: p.purchaseDate, nota: p.note })),
        };
      },
    },
    {
      name: "storico_patrimonio",
      title: "Andamento del patrimonio",
      description: "Una fotografia al giorno del patrimonio: netto, liquidità, investito, carte e debiti. Utile per vedere come è cambiato nel tempo.",
      inputSchema: {
        type: "object",
        properties: { giorni: { type: "integer", description: "Quanti giorni indietro (default 90)", minimum: 1, maximum: 365 } },
        additionalProperties: false,
      },
      run: async (args) => {
        const o = await ctx.overview();
        const from = shift(ctx.today, -((args.giorni as number) ?? 90));
        const days = o.days.filter((s) => s.date >= from);
        return {
          primo_giorno_salvato: o.days[0]?.date ?? null,
          giorni: days.map((s) => ({ data: s.date, netto: r2(s.total), liquidita: r2(s.cash), investito: r2(s.invested), carte: r2(s.cards), debiti: r2n(s.debts) })),
        };
      },
    },
    {
      name: "cose_strane",
      title: "Avvisi e spese strane",
      description: "Cose da sistemare (consensi in scadenza, budget superati, carte vicine al plafond…) e spese strane degli ultimi giorni: addebiti doppi, importi insoliti, nuove spese ricorrenti, aumenti.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: async () => {
        const o = await ctx.overview();
        return {
          avvisi: computeAlerts(o, ctx.today).map((a) => ({ livello: a.level, testo: a.text })),
          spese_strane: findOddities(o.moves, ctx.today, await ctx.catOpts()).map((x) => ({ tipo: x.kind, testo: x.text, data: x.date })),
        };
      },
    },
    {
      name: "inflazione",
      title: "Inflazione e patrimonio",
      description: "Inflazione italiana (IPCA, Eurostat) degli ultimi 12 mesi e il suo effetto in un anno su liquidità, investimenti, debiti e patrimonio netto.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: async () => {
        const [o, inf] = await Promise.all([ctx.overview(), loadInflation()]);
        if (!inf) throw new Error("Eurostat non risponde, riprova più tardi.");
        const i = wealthImpact(inf, o.totals, o.days);
        return {
          ultimo_mese: inf.series.at(-1),
          media_12_mesi: inf.avg12,
          ultimi_12_mesi: inf.series.slice(-12),
          effetto_in_un_anno: i
            ? {
                tasso: i.rate,
                liquidita: { importo: r2(i.cash.amount), potere_acquisto_perso: r2(i.cash.loss) },
                investimenti: { importo: r2(i.invested.amount), rendimento_per_restare_pari: r2(i.invested.loss) },
                debiti: { importo: r2(i.debts.amount), peso_reale_in_meno: r2(i.debts.gain) },
                patrimonio_netto: { importo: r2(i.net.amount), effetto: r2(-i.net.loss) },
                dal_primo_giorno: i.real ? { dal: i.real.from, variazione_nominale: r2(i.real.nominal), variazione_reale: r2(i.real.real), inflazione_fino_a: i.real.toMonth } : null,
              }
            : null,
          fonte: "Eurostat prc_hicp_minr, indice IPCA calcolato da ISTAT",
        };
      },
    },
    {
      name: "spese_730",
      title: "Spese detraibili per il 730",
      description: "Spese sanitarie e veterinarie detraibili trovate nei movimenti per un anno, con il rimborso stimato (19% oltre la franchigia).",
      inputSchema: {
        type: "object",
        properties: { anno: { type: "string", description: "Anno YYYY (default: anno in corso)", pattern: "^\\d{4}$" } },
        additionalProperties: false,
      },
      run: async (args) => {
        const anno = (args.anno as string) ?? ctx.today.slice(0, 4);
        const [items, years] = await Promise.all([listDeductions(anno), deductionYears()]);
        const s = summarizeDeductions(items);
        return {
          anno,
          anni_disponibili: years,
          sanitarie: r2(s.health),
          veterinarie: r2(s.vet),
          rimborso_stimato: r2(s.back),
          spese: items.map((d) => ({ data: d.date, importo: r2(d.amount), controparte: displayParty(d.party), tipo: d.type, esclusa: d.excluded, origine: d.source })),
        };
      },
    },
    {
      name: "costo_auto",
      title: "Quanto costa l'auto",
      description: "Costo dell'auto al mese e all'anno per voce (rata, carburante, pedaggi, parcheggi, manutenzione, assicurazione, bollo), costo al km se noto, e quanto costerà quando la rata è finita.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: async () => {
        const o = await ctx.overview();
        const saved = await getCarSettings();
        const settings = saved ?? { ...EMPTY_CAR, loanId: guessCarLoan(o.debts)?.id ?? null };
        const loan = o.debts.find((d) => d.id === settings.loanId && d.installment) ?? null;
        const c = carCost(o.moves, ctx.today, settings, loan ? { installment: loan.installment!, amount: loan.amount } : null, o.catRules);
        return {
          al_mese: r2(c.monthly),
          all_anno: r2(c.yearly),
          al_km: r2n(c.perKm),
          speso_questo_mese: r2(c.thisMonth),
          al_mese_senza_rata: r2(c.withoutLoan),
          mesi_usati_per_le_medie: c.basis,
          voci: c.lines.map((l) => ({ voce: l.label, al_mese: r2(l.monthly), da: l.source })),
        };
      },
    },
  ];
}

/** Le istruzioni che Claude riceve collegandosi: cosa c'è e come leggere i numeri. */
export const INSTRUCTIONS = [
  "Saldi è l'app personale di finanza dell'utente: conti bancari letti via PSD2, conti manuali, ETF e crypto, buoni postali, carte, debiti e beni.",
  "Tutti gli strumenti sono in sola lettura. Gli importi sono in euro, le date in YYYY-MM-DD, l'ora di riferimento è Europe/Rome.",
  "Parti da `riepilogo`; per le spese usa `spese_per_categoria`, `movimenti` e `report_mese`.",
  "I saldi sono l'ultima lettura salvata (campo `letto`), non una lettura in tempo reale; i movimenti coprono solo gli ultimi 90-120 giorni.",
  `Categorie di spesa: ${CAT_KEYS.map((k) => `${k} = ${catLabel(k)}`).join(", ")}.`,
  "Rispondi in italiano. Non sei un consulente finanziario autorizzato: dai numeri e ragionamenti, non raccomandazioni di investimento personalizzate.",
].join(" ");

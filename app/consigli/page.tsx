import { headers } from "next/headers";
import { Nav } from "@/app/nav";
import { psuHeadersFrom } from "@/lib/data";
import { hasStore } from "@/lib/store";
import { byAssetClass, byInstrument } from "@/lib/portfolio";
import { loadOverview, type Overview } from "@/lib/overview";
import { Planner, type Facts } from "./planner";

export const dynamic = "force-dynamic";

/** Indici riconoscibili dal nome: due ETF diversi sullo stesso indice sono un doppione. */
const INDEXES: [RegExp, string][] = [
  [/acwi|all country world/i, "MSCI ACWI"],
  [/world small cap/i, "MSCI World Small Cap"],
  [/msci world(?! small)/i, "MSCI World"],
  [/s&p ?500|sp ?500/i, "S&P 500"],
  [/emerging/i, "mercati emergenti"],
  [/\bgold\b|\boro\b/i, "oro fisico"],
];

/** Finanziarie e banche di credito al consumo riconoscibili dal nome del debito. */
const CONSUMER_LENDERS = /compass|findomestic|agos|cofidis|younited|fiditalia|santander consumer|deutsche bank easy|ibl|pitagora|prestito personale|finanziamento/i;

function facts(o: Overview): Facts {
  const t = o.totals;
  const instruments = byInstrument(o.holdings);
  const overlaps = INDEXES.map(([re, index]) => ({ index, names: instruments.filter((i) => re.test(i.name)).map((i) => i.name) })).filter(
    (g) => g.names.length > 1,
  );
  const classes = byAssetClass(o.holdings);
  const rated = o.bonds.filter((b) => b.grossRate !== null);
  const today = new Date().toISOString().slice(0, 10);
  return {
    net: t.net,
    cash: t.cash,
    holdings: t.holdings,
    bonds: t.bonds,
    cards: t.cards,
    debts: t.debts,
    beni: t.beni,
    cryptoValue: classes.find((c) => c.cls === "crypto")?.value ?? 0,
    bondRate: rated.length ? rated.reduce((s, b) => s + (b.grossRate ?? 0) * b.capital, 0) / rated.reduce((s, b) => s + b.capital, 0) : null,
    nextDebt:
      o.debts
        .filter((d) => d.dueDate && d.dueDate >= today)
        .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
        .map((d) => ({ name: d.name, amount: d.amount, dueDate: d.dueDate as string }))[0] ?? null,
    consumerDebt: o.debts.filter((d) => CONSUMER_LENDERS.test(d.name)).reduce((s, d) => s + d.amount, 0),
    overlaps,
    sameOnBrokers: instruments.filter((i) => i.brokers.length > 1).map((i) => i.name),
    brokers: new Set(o.holdings.map((h) => h.broker)).size,
  };
}

export default async function TipsPage() {
  let data: Facts | null = null;
  let error: string | null = null;
  if (hasStore()) {
    try {
      data = facts(await loadOverview(psuHeadersFrom(await headers())));
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <main className="container">
      <Nav current="/consigli" />
      <h1 className="page-title">Verso il milione</h1>
      <p className="page-lead">
        Non esistono scorciatoie: il milione si costruisce con il tasso di risparmio, il tempo e l’interesse composto.
        Qui vedi quanto ti manca e cosa conviene sistemare prima, calcolato sui tuoi numeri.
      </p>
      {error && <div className="notice error">{error}</div>}
      {data && <Planner facts={data} />}

      <h2 className="section-head">Le regole che contano</h2>
      <div className="principles">
        <div className="principle">
          <h3>Il tasso di risparmio batte il rendimento</h3>
          <p>All’inizio conta quanto metti da parte, non quanto rende: 300 € al mese in più valgono più di qualsiasi ETF scelto bene.</p>
        </div>
        <div className="principle">
          <h3>Aumenta le entrate</h3>
          <p>Le spese si tagliano fino a un certo punto, le entrate no: competenze, cambio di lavoro, un’entrata extra. Investi gli aumenti, non spenderli.</p>
        </div>
        <div className="principle">
          <h3>Regola del 72</h3>
          <p>72 diviso il rendimento annuo dà gli anni per raddoppiare: al 6% raddoppi in circa 12 anni, al 2% in 36.</p>
        </div>
        <div className="principle">
          <h3>Costi bassi, sempre</h3>
          <p>Un ETF globale costa 0,1–0,4% l’anno; un fondo attivo in banca spesso 1,5–2%. Su 30 anni la differenza può mangiarsi fino a un terzo del capitale finale.</p>
        </div>
        <div className="principle">
          <h3>Automatico e noioso</h3>
          <p>Un piano di accumulo che parte da solo ogni mese evita di indovinare il momento giusto. Nessuno ci riesce con costanza.</p>
        </div>
        <div className="principle">
          <h3>Resta investito nei crolli</h3>
          <p>Cali del 30% capitano più volte nella vita. Chi vende nel panico trasforma un calo temporaneo in una perdita vera.</p>
        </div>
        <div className="principle">
          <h3>Il fisco conta</h3>
          <p>Le plusvalenze su ETF sono tassate al 26%, i titoli di Stato al 12,5%. Il fondo pensione è deducibile fino a 5.164,57 € l’anno: un risparmio d’imposta immediato.</p>
        </div>
        <div className="principle">
          <h3>Diffida del “ricco in fretta”</h3>
          <p>Trading con leva, segnali a pagamento, rendimenti garantiti alti: chi promette di arrivarci in pochi anni di solito guadagna sui tuoi soldi.</p>
        </div>
      </div>

      <p className="fineprint">
        Informazioni a scopo educativo, non consulenza finanziaria personalizzata. I rendimenti sono ipotesi, non garanzie: quelli
        passati non si ripetono per forza. Per decisioni importanti (debiti, fondo pensione, tasse) senti un consulente indipendente.
      </p>
    </main>
  );
}

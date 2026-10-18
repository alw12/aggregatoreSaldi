"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/** Numeri calcolati sul server dai dati dell'app. */
export type Facts = {
  net: number;
  cash: number;
  holdings: number;
  bonds: number;
  cards: number;
  debts: number;
  beni: number;
  cryptoValue: number;
  bondRate: number | null; // tasso lordo medio dei buoni, %
  nextDebt: { name: string; amount: number; dueDate: string } | null;
  overlaps: { index: string; names: string[] }[];
  sameOnBrokers: string[];
  brokers: number;
};

const TARGET = 1_000_000;
const STORE = "saldi:planner";

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(n);
const pct = (n: number) => new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 0 }).format(n);
const compact = (n: number) => new Intl.NumberFormat("it-IT", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const date = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const monthlyRate = (annualPct: number) => Math.pow(1 + annualPct / 100, 1 / 12) - 1;

/** Valore dopo m mesi partendo da P e versando C a fine mese. */
function futureValue(P: number, C: number, annualPct: number, m: number) {
  const i = monthlyRate(annualPct);
  if (i === 0) return P + C * m;
  const g = Math.pow(1 + i, m);
  return P * g + (C * (g - 1)) / i;
}

/** Mesi per arrivare al milione; null se non ci si arriva entro 100 anni. */
function monthsToTarget(P: number, C: number, annualPct: number) {
  if (P >= TARGET) return 0;
  for (let m = 1; m <= 1200; m++) if (futureValue(P, C, annualPct, m) >= TARGET) return m;
  return null;
}

/** Versamento mensile che serve per arrivarci in `years` anni. */
function monthlyNeeded(P: number, annualPct: number, years: number) {
  const n = years * 12;
  const i = monthlyRate(annualPct);
  const g = i === 0 ? 1 : Math.pow(1 + i, n);
  const rest = TARGET - P * g;
  if (rest <= 0) return 0;
  return i === 0 ? rest / n : (rest * i) / (g - 1);
}

const yearsLabel = (m: number | null) => {
  if (m === null) return "oltre 100 anni";
  if (m === 0) return "già raggiunto";
  const y = Math.floor(m / 12);
  const r = m % 12;
  return r ? `${y} anni e ${r} mesi` : `${y} anni`;
};

type Inputs = { start: string; monthly: string; rate: string; age: string; spese: string };
const num = (s: string) => {
  const n = Number(String(s).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export function Planner({ facts }: { facts: Facts }) {
  const [inp, setInp] = useState<Inputs>({
    start: String(Math.max(0, Math.round(facts.net))),
    monthly: "300",
    rate: "5",
    age: "",
    spese: "",
  });

  // Ripristina i valori dell'ultima visita (solo su questo browser)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? "null") as Partial<Inputs> | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage esiste solo dopo il montaggio
      if (saved) setInp((v) => ({ ...v, ...saved }));
    } catch {}
  }, []);
  const set = (k: keyof Inputs) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = { ...inp, [k]: e.target.value };
    setInp(next);
    try {
      localStorage.setItem(STORE, JSON.stringify(next));
    } catch {}
  };

  const P = Math.max(0, num(inp.start));
  const C = Math.max(0, num(inp.monthly));
  const r = Math.min(15, Math.max(0, num(inp.rate)));
  const age = num(inp.age);
  const months = monthsToTarget(P, C, r);
  const atAge = months !== null && age > 0 ? Math.floor(age + months / 12) : null;

  return (
    <>
      <section className="card chart-card">
        <div className="chart-title">Quando arrivi a 1 milione</div>
        <p className="chart-note">Cambia i numeri: il calcolo si aggiorna subito e resta salvato su questo dispositivo.</p>
        <div className="planner-inputs">
          <label>
            Patrimonio di partenza (€)
            <input inputMode="decimal" value={inp.start} onChange={set("start")} />
          </label>
          <label>
            Versamento mensile (€)
            <input inputMode="decimal" value={inp.monthly} onChange={set("monthly")} />
          </label>
          <label>
            Rendimento annuo reale (%)
            <input inputMode="decimal" value={inp.rate} onChange={set("rate")} />
          </label>
          <label>
            La tua età (facoltativa)
            <input inputMode="numeric" value={inp.age} onChange={set("age")} placeholder="es. 24" />
          </label>
        </div>
        <p className="planner-result">{yearsLabel(months)}</p>
        <p className="chart-note">
          {months === null
            ? "Con questi numeri non ci arrivi: aumenta il versamento mensile."
            : months === 0
              ? "Sei già milionario."
              : <>Con {eur(C)} al mese al {r}% reale{atAge ? <>, ci arrivi a <strong>{atAge} anni</strong></> : ""}. Di tuo ci metti {eur(P + C * months)}, il resto lo fa l’interesse composto.</>}
          {facts.net < 0 && " Il punto di partenza è 0 perché oggi il patrimonio netto è negativo."}
        </p>
        <Projection P={P} C={C} rate={r} months={months} />
        <table className="scenarios">
          <caption className="chart-note" style={{ textAlign: "left", captionSide: "top", margin: "0 0 4px" }}>
            Anni per arrivarci, secondo versamento e rendimento
          </caption>
          <thead>
            <tr>
              <th scope="col">Al mese</th>
              <th scope="col">3%</th>
              <th scope="col">5%</th>
              <th scope="col">7%</th>
            </tr>
          </thead>
          <tbody>
            {[100, 300, 500, 1000, 2000].map((c) => (
              <tr key={c} className={c === C ? "current" : undefined}>
                <td>{eur(c)}</td>
                {[3, 5, 7].map((rr) => {
                  const m = monthsToTarget(P, c, rr);
                  return <td key={rr}>{m === null ? "> 100" : Math.ceil(m / 12)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="chart-note" style={{ margin: "12px 0 0" }}>
          Per arrivarci al {r}% ti servono {[20, 25, 30, 40].map((y, i, a) => (
            <span key={y}>
              <strong>{eur(Math.ceil(monthlyNeeded(P, r, y)))}</strong> al mese in {y} anni{i < a.length - 2 ? ", " : i === a.length - 2 ? " o " : "."}
            </span>
          ))}{" "}
          Rendimento reale = al netto dell’inflazione: le cifre sono in euro di oggi. Un portafoglio azionario globale ha reso in media circa il 5% reale l’anno nel lungo periodo, con anni molto negativi in mezzo.
        </p>
      </section>

      <section className="card chart-card">
        <div className="chart-title">I tuoi prossimi passi</div>
        <p className="chart-note">In ordine di priorità, calcolati sui tuoi conti.</p>
        <label className="form-grid" style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Quanto spendi in un mese, circa (€)</span>
          <input inputMode="decimal" value={inp.spese} onChange={set("spese")} placeholder="es. 1.200" />
        </label>
        <Steps facts={facts} spese={num(inp.spese)} />
      </section>
    </>
  );
}

type Step = { state: "done" | "todo" | "urgent" | "info"; title: string; body: ReactNode };
const STATE_LABEL: Record<Step["state"], string> = { done: "fatto", todo: "da fare", urgent: "priorità", info: "da valutare" };

function Steps({ facts: f, spese }: { facts: Facts; spese: number }) {
  const liquid = f.cash + f.holdings + f.bonds;
  const invested = f.holdings + f.bonds;
  const steps: Step[] = [];

  if (f.debts > 0) {
    steps.push({
      state: f.debts > liquid ? "urgent" : "todo",
      title: "Sistema i debiti",
      body: (
        <>
          Devi <strong>{eur(f.debts)}</strong>
          {liquid > 0 && <>, il {pct(f.debts / liquid)} di liquidità e investimenti messi insieme</>}. Se un debito ha interessi,
          restituirlo rende esattamente quel tasso, garantito: di solito batte qualsiasi investimento. Se è senza interessi (per esempio
          con un familiare), rispetta le scadenze e intanto continua a investire.
          {f.nextDebt && <> Prossima scadenza: <strong>{f.nextDebt.name}</strong>, {eur(f.nextDebt.amount)} entro il {date(f.nextDebt.dueDate)}.</>}
        </>
      ),
    });
  }

  if (spese > 0) {
    const covered = f.cash / spese;
    steps.push({
      state: covered >= 3 ? "done" : covered >= 1 ? "todo" : "urgent",
      title: "Fondo di emergenza",
      body:
        covered >= 3 ? (
          <>La liquidità ({eur(f.cash)}) copre <strong>{covered.toFixed(1).replace(".", ",")} mesi</strong> di spese: oltre i 6 mesi ({eur(spese * 6)}) i soldi fermi perdono valore con l’inflazione, possono lavorare.</>
        ) : (
          <>La liquidità ({eur(f.cash)}) copre <strong>{covered.toFixed(1).replace(".", ",")} mesi</strong> di spese. Punta ad almeno 3 mesi ({eur(spese * 3)}) su un conto, prima di aumentare gli investimenti: evita di vendere ETF in perdita per un imprevisto.</>
        ),
    });
  } else {
    steps.push({
      state: "info",
      title: "Fondo di emergenza",
      body: <>Scrivi qui sopra quanto spendi al mese: ti dico quanti mesi copre la tua liquidità ({eur(f.cash)}). L’obiettivo è 3–6 mesi.</>,
    });
  }

  if (f.cards > 0) {
    steps.push({
      state: f.cash >= f.cards ? "done" : "urgent",
      title: "Carte di credito pagate per intero",
      body:
        f.cash >= f.cards ? (
          <>Le carte da addebitare ({eur(f.cards)}) sono coperte dalla liquidità. Continua a saldarle per intero: le rate revolving costano spesso il 15–20% l’anno.</>
        ) : (
          <>Le carte da addebitare ({eur(f.cards)}) superano la liquidità ({eur(f.cash)}). Evita di passare a rate: costano spesso il 15–20% l’anno.</>
        ),
    });
  }

  steps.push(
    f.holdings > 0
      ? {
          state: "done",
          title: "Investi ogni mese, in automatico",
          body: <>Hai {eur(f.holdings)} in ETF e crypto{f.brokers > 1 ? ` su ${f.brokers} broker` : ""}. Tieni il piano di accumulo automatico e alzalo a ogni aumento di stipendio: è la leva che sposta di più gli anni qui sopra.</>,
        }
      : {
          state: "todo",
          title: "Inizia un piano di accumulo",
          body: <>Un PAC mensile su un ETF azionario globale (per esempio MSCI ACWI o FTSE All-World) è il modo più semplice per far lavorare l’interesse composto.</>,
        },
  );

  if (f.overlaps.length > 0 || f.sameOnBrokers.length > 0) {
    steps.push({
      state: "todo",
      title: "Semplifica il portafoglio",
      body: (
        <>
          {f.overlaps.map((o) => (
            <span key={o.index}>
              Hai {o.names.length} strumenti sullo stesso {o.index === "oro fisico" ? "sottostante" : "indice"} <strong>{o.index}</strong> ({o.names.join(", ")}).{" "}
            </span>
          ))}
          {f.sameOnBrokers.length > 0 && <>Lo stesso ETF ({f.sameOnBrokers.join(", ")}) è su più broker. </>}
          Non aggiunge diversificazione: per i prossimi acquisti scegline uno per indice e un broker per strumento. Non serve vendere quello che hai.
        </>
      ),
    });
  }

  if (invested > 0 && f.bonds / liquid > 0.4) {
    steps.push({
      state: "info",
      title: "Buoni postali: sicuri ma lenti",
      body: (
        <>
          Sono il <strong>{pct(f.bonds / liquid)}</strong> dei tuoi soldi{f.bondRate !== null && <>, a un tasso medio del {f.bondRate.toFixed(2).replace(".", ",")}% lordo</>}.
          Garantiti dallo Stato e con tassazione al 12,5%, ma su 20–30 anni rendono meno dell’azionario globale. Alla scadenza valuta
          quanta parte spostare sul PAC, tenendo al sicuro i soldi che ti servono nei prossimi anni.
        </>
      ),
    });
  }

  if (f.cryptoValue > 0 && invested > 0) {
    const share = f.cryptoValue / invested;
    steps.push({
      state: share > 0.1 ? "todo" : "done",
      title: "Crypto in piccola dose",
      body:
        share > 0.1 ? (
          <>Le crypto sono il {pct(share)} degli investimenti: oltre il 5–10% il loro rischio domina tutto il portafoglio.</>
        ) : (
          <>Le crypto sono il {pct(share)} degli investimenti: una quota piccola, che non mette a rischio il resto.</>
        ),
    });
  }

  steps.push({
    state: "info",
    title: "Fondo pensione",
    body: <>I versamenti sono deducibili fino a 5.164,57 € l’anno e, se sei dipendente, spesso il datore di lavoro aggiunge un contributo. Su orizzonti lunghi è uno dei pochi “regali” fiscali disponibili.</>,
  });

  const order = { urgent: 0, todo: 1, info: 2, done: 3 } as const;
  steps.sort((a, b) => order[a.state] - order[b.state]);

  return (
    <ol className="steps">
      {steps.map((s, i) => (
        <li key={s.title} className={`step ${s.state}`}>
          <span className="step-mark" aria-hidden>{s.state === "done" ? "✓" : s.state === "urgent" ? "!" : i + 1}</span>
          <div>
            <div className="step-title">
              {s.title}
              <span className="step-state">{STATE_LABEL[s.state]}</span>
            </div>
            <div className="step-body">{s.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

const H = 200;
const PAD = { top: 14, right: 12, bottom: 24, left: 52 };

/** Crescita anno per anno: patrimonio contro quanto hai versato, con la soglia del milione. */
function Projection({ P, C, rate, months }: { P: number; C: number; rate: number; months: number | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const years = Math.min(60, Math.max(10, months === null ? 40 : Math.ceil(months / 12) + 2));
  const pts = useMemo(
    () => Array.from({ length: years + 1 }, (_, y) => ({ y, value: futureValue(P, C, rate, y * 12), paid: P + C * 12 * y })),
    [P, C, rate, years],
  );
  const iw = width - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const hi = Math.max(TARGET * 1.1, pts[pts.length - 1].value);
  const x = (y: number) => PAD.left + (y / years) * iw;
  const yv = (v: number) => PAD.top + ih - (v / hi) * ih;
  const line = (f: (p: (typeof pts)[number]) => number) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.y).toFixed(1)},${yv(f(p)).toFixed(1)}`).join("");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => k * hi);
  const h = hover !== null ? pts[hover] : null;

  const move = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const rel = (clientX - rect.left - PAD.left) / iw;
    setHover(Math.min(years, Math.max(0, Math.round(rel * years))));
  };

  return (
    <figure style={{ margin: "8px 0 0" }}>
      <div className="alloc-legend" style={{ display: "flex", gap: 16, margin: "0 0 8px", fontSize: 13 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span className="swatch s1" aria-hidden />Patrimonio</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span className="swatch s3" aria-hidden />Versato da te</span>
      </div>
      <div
        ref={ref}
        className="trend"
        tabIndex={0}
        role="img"
        aria-label={`Proiezione su ${years} anni: da ${eur(P)} a ${eur(pts[years].value)}, versando ${eur(pts[years].paid)}`}
        onMouseMove={(e) => move(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchMove={(e) => move(e.touches[0].clientX)}
        onTouchEnd={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setHover((v) => Math.max(0, (v ?? years + 1) - 1));
          if (e.key === "ArrowRight") setHover((v) => Math.min(years, (v ?? -1) + 1));
        }}
        onBlur={() => setHover(null)}
      >
        <svg width={width} height={H} aria-hidden>
          {ticks.map((v) => (
            <g key={v}>
              <line className="grid" x1={PAD.left} x2={width - PAD.right} y1={yv(v)} y2={yv(v)} />
              <text className="tick" x={PAD.left - 8} y={yv(v) + 4} textAnchor="end">{compact(v)} €</text>
            </g>
          ))}
          {[0, Math.round(years / 2), years].map((y) => (
            <text key={y} className="tick" x={x(y)} y={H - 6} textAnchor={y === 0 ? "start" : y === years ? "end" : "middle"}>
              {y === 0 ? "oggi" : `${y} anni`}
            </text>
          ))}
          <line x1={PAD.left} x2={width - PAD.right} y1={yv(TARGET)} y2={yv(TARGET)} stroke="var(--faint)" strokeDasharray="4 4" />
          <text className="tick" x={width - PAD.right} y={yv(TARGET) - 6} textAnchor="end">1 milione</text>
          <path d={line((p) => p.paid)} fill="none" stroke="var(--s3)" strokeWidth={2} strokeLinejoin="round" />
          <path d={line((p) => p.value)} fill="none" stroke="var(--s1)" strokeWidth={2} strokeLinejoin="round" />
          {h && (
            <>
              <line className="crosshair" x1={x(h.y)} x2={x(h.y)} y1={PAD.top} y2={PAD.top + ih} />
              <circle cx={x(h.y)} cy={yv(h.paid)} r={4} fill="var(--s3)" stroke="var(--surface)" strokeWidth={2} />
              <circle cx={x(h.y)} cy={yv(h.value)} r={4} fill="var(--s1)" stroke="var(--surface)" strokeWidth={2} />
            </>
          )}
        </svg>
        {h && (
          <div className="tooltip" style={{ left: Math.min(width - 170, Math.max(0, x(h.y) + 10)), top: 8 }}>
            <div className="tooltip-date">{h.y === 0 ? "Oggi" : `Tra ${h.y} anni`}</div>
            <div className="tooltip-value">{eur(h.value)}</div>
            <div className="tooltip-date">versati {eur(h.paid)}</div>
          </div>
        )}
      </div>
    </figure>
  );
}

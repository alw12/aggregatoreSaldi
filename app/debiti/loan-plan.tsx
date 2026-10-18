"use client";

import { useState } from "react";
import { earlyRepaymentFee, payoff, prepaymentSaving } from "@/lib/finance";

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(n);
const monthYear = (months: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
};
const duration = (m: number) => {
  const y = Math.floor(m / 12);
  const r = m % 12;
  return [y && `${y} ${y === 1 ? "anno" : "anni"}`, r && `${r} ${r === 1 ? "mese" : "mesi"}`].filter(Boolean).join(" e ") || "0 mesi";
};
const num = (s: string) => {
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Piano di un prestito: quando finisce, quanti interessi restano, quanto si risparmia restituendo prima. */
export function LoanPlan({ name, balance, installment, rate }: { name: string; balance: number; installment: number; rate: number | null }) {
  const [extra, setExtra] = useState("");
  const taeg = rate ?? 0;
  const base = payoff(balance, installment, taeg);
  const x = Math.min(balance, num(extra));
  const saving = x > 0 ? prepaymentSaving(balance, installment, taeg, x) : null;
  const fullFee = base ? earlyRepaymentFee(balance, balance, base.months) : 0;

  return (
    <section className="card chart-card">
      <div className="chart-title">Piano: {name}</div>
      {!base ? (
        <p className="chart-note" style={{ marginBottom: 0 }}>Con questa rata il debito non scende: controlla rata e TAEG.</p>
      ) : (
        <>
          <p className="chart-note">
            {rate === null
              ? "Senza TAEG calcolo solo la durata: aggiungilo per vedere gli interessi."
              : "Stima con il TAEG come tasso: gli interessi veri possono essere un po’ più bassi."}
          </p>
          <div className="tiles">
            <div className="tile">
              <span className="tile-label">Finisci di pagare</span>
              <span className="tile-value loan-figure">{monthYear(base.months)}</span>
              <span className="tile-sub">tra {duration(base.months)}</span>
            </div>
            {rate !== null && (
              <div className="tile">
                <span className="tile-label">Interessi che restano</span>
                <span className="tile-value loan-figure">{eur(base.interest)}</span>
                <span className="tile-sub">su {eur(balance)} di debito</span>
              </div>
            )}
            {rate !== null && (
              <div className="tile">
                <span className="tile-label">Estinguere tutto oggi</span>
                <span className="tile-value loan-figure">{eur(balance + fullFee)}</span>
                <span className="tile-sub">{fullFee ? `penale massima ${eur(fullFee)}` : "senza penale (residuo ≤ 10.000 €)"}</span>
              </div>
            )}
          </div>
          <label className="form-grid" style={{ marginTop: 4 }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>Se restituisco subito in più (€)</span>
            <input inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="es. 1.000" />
          </label>
          {saving && (
            <p className="chart-note" style={{ margin: "10px 0 0" }}>
              Restituendo <strong>{eur(x)}</strong> finisci {saving.monthsSaved > 0 ? <><strong>{duration(saving.monthsSaved)}</strong> prima ({monthYear(saving.after.months)})</> : "nello stesso mese"}
              {rate !== null && <> e risparmi circa <strong>{eur(Math.max(0, saving.interestSaved - saving.fee))}</strong> di interessi{saving.fee ? `, già tolta la penale massima di ${eur(saving.fee)}` : ""}</>}.
              {rate !== null && x > 0 && <> È come un investimento senza rischio al {String(rate).replace(".", ",")}% l’anno.</>}
            </p>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Modifica rapida di un saldo direttamente in dashboard: un <details> che apre
 * un mini form verso /api/balances. Nessun JavaScript lato client.
 */
export function QuickEdit({
  kind,
  id,
  value,
  placeholder = "es. 1.234,56",
  extra,
  summary = "Modifica saldo",
}: {
  kind: "account" | "manual" | "card" | "bond";
  id: string;
  value: number | null;
  placeholder?: string;
  /** Pulsante secondario (es. "Azzera" o "Automatico"), inviato come action. */
  extra?: { action: string; label: string };
  summary?: string;
}) {
  return (
    <details className="quick">
      <summary>{summary}</summary>
      <form method="post" action="/api/balances">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="id" value={id} />
        <input
          name="amount"
          inputMode="decimal"
          placeholder={placeholder}
          aria-label="Nuovo saldo"
          defaultValue={value !== null ? String(Math.round(value * 100) / 100).replace(".", ",") : undefined}
        />
        <button className="btn" type="submit" name="action" value="set">Salva</button>
        {extra && (
          <button className="btn btn-ghost" type="submit" name="action" value={extra.action} formNoValidate>
            {extra.label}
          </button>
        )}
      </form>
    </details>
  );
}

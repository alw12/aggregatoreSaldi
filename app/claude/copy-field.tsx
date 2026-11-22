"use client";

import { useState } from "react";

/** Indirizzo del connettore con il pulsante Copia. */
export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-field">
      <code>{value}</code>
      <button
        className="btn btn-ghost"
        type="button"
        onClick={() =>
          navigator.clipboard.writeText(value).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            },
            () => undefined,
          )
        }
      >
        {copied ? "Copiato" : "Copia"}
      </button>
    </div>
  );
}

"use client"; // i confini di errore sono componenti client

import Link from "next/link";
import { useEffect } from "react";

/** Errore imprevisto in una pagina: messaggio chiaro e pulsante per riprovare, al posto della pagina di sistema. */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="container">
      <div className="card empty">
        <p>
          Qualcosa non ha risposto: una banca, i prezzi o il database.
          <br />
          Di solito basta riprovare tra qualche secondo.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button className="btn btn-primary" type="button" onClick={() => retry()}>Riprova</button>
          <Link className="btn" href="/">Panoramica</Link>
        </div>
        {error.digest && <p className="fineprint">Codice errore: {error.digest}</p>}
      </div>
    </main>
  );
}

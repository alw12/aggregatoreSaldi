import Link from "next/link";
import { listAspsps, type Aspsp } from "@/lib/eb";

export const dynamic = "force-dynamic";

const COUNTRIES = ["IT", "LT", "ES", "DE", "FR", "IE", "NL", "BE", "AT", "PT"];

export default async function ConnectPage({ searchParams }: PageProps<"/connect">) {
  const sp = await searchParams;
  const country = typeof sp.country === "string" && COUNTRIES.includes(sp.country) ? sp.country : "IT";
  const query = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const error = typeof sp.error === "string" ? sp.error : null;

  let aspsps: Aspsp[] = [];
  let loadError: string | null = null;
  try {
    aspsps = await listAspsps(country);
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }
  const filtered = query ? aspsps.filter((a) => a.name.toLowerCase().includes(query)) : aspsps;

  return (
    <main className="container">
      <header className="topbar">
        <h1>Collega una banca</h1>
        <Link className="btn" href="/">← Indietro</Link>
      </header>

      {error && <div className="notice error">{error}</div>}
      {loadError && <div className="notice error">Impossibile caricare le banche: {loadError}</div>}

      <form className="filters" method="get">
        <select name="country" defaultValue={country}>
          {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="search" name="q" placeholder="Cerca banca (es. Poste, BBVA, Revolut)" defaultValue={query} />
        <button className="btn" type="submit">Cerca</button>
      </form>

      <div className="bank-list">
        {filtered.map((a) => (
          <form key={`${a.country}-${a.name}`} method="post" action="/api/eb/auth">
            <input type="hidden" name="name" value={a.name} />
            <input type="hidden" name="country" value={a.country} />
            <input type="hidden" name="maxValidity" value={a.maximum_consent_validity} />
            <button className="bank-item" type="submit">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${a.logo}-/resize/64x/`} alt="" loading="lazy" />
              <span>{a.name}{a.beta ? " (beta)" : ""}</span>
            </button>
          </form>
        ))}
      </div>

      {!loadError && filtered.length === 0 && <p className="empty">Nessuna banca trovata.</p>}
    </main>
  );
}

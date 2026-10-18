import Link from "next/link";
import { BottomNav } from "./bottom-nav";
import { PrivacyToggle } from "./privacy";

const SECTIONS = [
  { href: "/", label: "Panoramica" },
  { href: "/grafici", label: "Grafici" },
  { href: "/movimenti", label: "Movimenti" },
  { href: "/portfolio", label: "Portafoglio" },
  { href: "/buoni", label: "Buoni" },
  { href: "/carte", label: "Carte" },
  { href: "/conti", label: "Conti" },
  { href: "/beni", label: "Beni" },
  { href: "/debiti", label: "Debiti" },
  { href: "/consigli", label: "Milionario" },
  { href: "/avvisi", label: "Avvisi" },
] as const;

/** Testata comune: marchio, sezioni (su telefono nella barra in basso), privacy, aggiorna ed esci. */
export function Nav({ current }: { current: string }) {
  return (
    <header className="masthead">
      <div className="masthead-row">
        <Link href="/" className="wordmark">Saldi</Link>
        <div className="tools">
          <PrivacyToggle />
          <form method="post" action="/api/refresh">
            <button className="btn btn-quiet" type="submit" title="Rileggi saldi e prezzi">Aggiorna</button>
          </form>
          <form method="post" action="/api/logout">
            <button className="btn btn-quiet" type="submit">Esci</button>
          </form>
        </div>
      </div>
      <nav className="sections" aria-label="Sezioni" id="sections">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="section-link" aria-current={s.href === current ? "page" : undefined}>
            {s.label}
          </Link>
        ))}
        <Link href="/connect" className="section-link add" aria-current={current === "/connect" ? "page" : undefined}>
          Collega banca
        </Link>
      </nav>
      <BottomNav />
    </header>
  );
}

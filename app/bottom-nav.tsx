"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const icon = (d: ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);

const TABS = [
  { href: "/", label: "Panoramica", icon: icon(<><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></>) },
  { href: "/grafici", label: "Grafici", icon: icon(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>) },
  { href: "/movimenti", label: "Movimenti", icon: icon(<><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" /></>) },
  { href: "/portfolio", label: "Portafoglio", icon: icon(<><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>) },
] as const;

const MORE = [
  { href: "/buoni", label: "Buoni postali" },
  { href: "/carte", label: "Carte di credito" },
  { href: "/conti", label: "Conti manuali" },
  { href: "/beni", label: "Beni" },
  { href: "/debiti", label: "Debiti" },
  { href: "/consigli", label: "Verso il milione" },
  { href: "/avvisi", label: "Avvisi e notifiche" },
  { href: "/connect", label: "Collega banca" },
] as const;

/** Barra in basso su telefono: quattro sezioni principali e "Altro" per il resto. */
export function BottomNav() {
  const pathname = usePathname();
  // Aperto solo sulla pagina da cui lo si è aperto: cambiando pagina si chiude da solo
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const inMore = MORE.some((m) => pathname.startsWith(m.href));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenAt(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {open && (
        <div className="sheet-backdrop" onClick={() => setOpenAt(null)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Altre sezioni" onClick={(e) => e.stopPropagation()}>
            {MORE.map((m) => (
              <Link key={m.href} href={m.href} className="sheet-link" aria-current={pathname.startsWith(m.href) ? "page" : undefined}>
                {m.label}
              </Link>
            ))}
          </div>
        </div>
      )}
      <nav className="tabbar" aria-label="Sezioni principali">
        {TABS.map((t) => {
          const current = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href} className="tab" aria-current={current ? "page" : undefined}>
              {t.icon}
              <span>{t.label}</span>
            </Link>
          );
        })}
        <button type="button" className="tab" aria-expanded={open} aria-current={inMore ? "page" : undefined} onClick={() => setOpenAt(open ? null : pathname)}>
          {icon(<><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></>)}
          <span>Altro</span>
        </button>
      </nav>
    </>
  );
}

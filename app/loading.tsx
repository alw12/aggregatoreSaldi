import { Nav } from "./nav";

/** Mostrato subito mentre il server legge banche, prezzi e database. */
export default function Loading() {
  return (
    <main className="container" aria-busy="true">
      <Nav current="" />
      <div className="skeleton" role="status" aria-label="Caricamento">
        <div className="sk sk-title" />
        <div className="sk sk-hero" />
        <div className="sk sk-bar" />
        <div className="sk sk-card" />
        <div className="sk sk-card" />
      </div>
    </main>
  );
}

import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container">
      <div className="card empty">
        <p>Questa pagina non esiste.</p>
        <Link className="btn btn-primary" href="/">Torna alla panoramica</Link>
      </div>
    </main>
  );
}

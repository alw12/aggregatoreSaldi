export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const error = sp.error === "1" || sp.error === "spaces";
  // Solo dopo un errore, per capire se il deploy attivo vede BOT_PASSWORD
  const botMissing = error && !process.env.BOT_PASSWORD;
  const next = typeof sp.next === "string" ? sp.next : "/";

  return (
    <main className="login-wrap">
      <form className="card login" method="post" action="/api/login">
        <h1>Saldi</h1>
        <p>Inserisci la password per continuare.</p>
        {error && <div className="notice error">Password errata.</div>}
        {botMissing && <div className="notice">Utente bot non configurato: questo deploy non vede BOT_PASSWORD.</div>}
        {sp.error === "spaces" && (
          <div className="notice">BOT_PASSWORD su Vercel contiene spazi o a capo all&apos;inizio o alla fine: correggila e rifai il deploy.</div>
        )}
        <input type="hidden" name="next" value={next} />
        <input type="password" name="password" placeholder="Password" autoFocus required autoComplete="current-password" />
        <button className="btn btn-primary" type="submit">Entra</button>
      </form>
    </main>
  );
}

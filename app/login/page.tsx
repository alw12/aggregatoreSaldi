export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const error = sp.error === "1";
  const next = typeof sp.next === "string" ? sp.next : "/";

  return (
    <main className="login-wrap">
      <form className="card login" method="post" action="/api/login">
        <h1>Saldi</h1>
        <p>Inserisci la password per continuare.</p>
        {error && <div className="notice error">Password errata.</div>}
        <input type="hidden" name="next" value={next} />
        <input type="password" name="password" placeholder="Password" autoFocus required autoComplete="current-password" />
        <button className="btn btn-primary" type="submit">Entra</button>
      </form>
    </main>
  );
}

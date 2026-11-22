import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  authServerMetadata,
  bearer,
  clientCredentials,
  parseAuthorize,
  parseRegistration,
  pkceOk,
  protectedResourceMetadata,
  randomToken,
  redirectAllowed,
  redirectBack,
  safeEqual,
  sha256,
} from "@/lib/oauth-core";

const ORIGIN = "https://visualizzasaldi.vercel.app";
const CB = "https://claude.ai/api/mcp/auth_callback";
// Challenge calcolato con node:crypto, indipendente dall'implementazione testata
const VERIFIER = "dBjftJeZ4CVP-mJ92K9Ys9Wk0J1qyEqA6DzBaWmIo1Ik";
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

describe("redirect ammessi", () => {
  it("accetta i callback di Claude e localhost", () => {
    expect(redirectAllowed(CB)).toBe(true);
    expect(redirectAllowed("https://claude.com/api/mcp/auth_callback")).toBe(true);
    expect(redirectAllowed("http://localhost:6274/oauth/callback")).toBe(true);
    expect(redirectAllowed("http://127.0.0.1:33418/callback")).toBe(true);
  });

  it("rifiuta tutto il resto, anche se somiglia", () => {
    expect(redirectAllowed("https://evil.example/api/mcp/auth_callback")).toBe(false);
    expect(redirectAllowed("https://claude.ai.evil.example/api/mcp/auth_callback")).toBe(false);
    expect(redirectAllowed("https://claude.ai/altro")).toBe(false);
    expect(redirectAllowed(`${CB}?x=1`)).toBe(false);
    expect(redirectAllowed(`${CB}#f`)).toBe(false);
    expect(redirectAllowed("http://claude.ai/api/mcp/auth_callback")).toBe(false);
    expect(redirectAllowed("https://localhost/callback")).toBe(false);
    expect(redirectAllowed("javascript:alert(1)")).toBe(false);
    expect(redirectAllowed("non un url")).toBe(false);
  });

  it("aggiunge quelli in OAUTH_EXTRA_REDIRECTS", () => {
    expect(redirectAllowed("https://mio.example/cb", ["https://mio.example/cb"])).toBe(true);
  });
});

describe("PKCE e segreti", () => {
  it("verifica il challenge S256", async () => {
    expect(await pkceOk(VERIFIER, CHALLENGE)).toBe(true);
    expect(await pkceOk(`${VERIFIER.slice(0, -1)}J`, CHALLENGE)).toBe(false);
    expect(await pkceOk("corto", CHALLENGE)).toBe(false);
  });

  it("token casuali con prefisso, diversi ogni volta", () => {
    const a = randomToken("saldi_at_");
    expect(a).toMatch(/^saldi_at_[A-Za-z0-9_-]{43}$/);
    expect(randomToken("saldi_at_")).not.toBe(a);
  });

  it("sha256 in esadecimale e confronto sicuro", async () => {
    expect(await sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
  });
});

describe("metadati", () => {
  it("la risorsa punta al server di autorizzazione dello stesso sito", () => {
    const pr = protectedResourceMetadata(ORIGIN);
    expect(pr.resource).toBe(`${ORIGIN}/api/mcp`);
    expect(pr.authorization_servers).toEqual([ORIGIN]);
    const as = authServerMetadata(ORIGIN);
    expect(as.issuer).toBe(ORIGIN);
    expect(as.code_challenge_methods_supported).toEqual(["S256"]);
    expect(as.registration_endpoint).toBe(`${ORIGIN}/api/oauth/register`);
  });
});

describe("registrazione dinamica", () => {
  it("accetta claude.ai senza segreto", () => {
    const r = parseRegistration({ redirect_uris: [CB], client_name: "Claude", token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] });
    expect(r).toEqual({ redirect_uris: [CB], client_name: "Claude", token_endpoint_auth_method: "none" });
  });

  it("rifiuta redirect estranei, grant e metodi non supportati", () => {
    expect(parseRegistration({ redirect_uris: ["https://evil.example/cb"] })).toMatchObject({ error: "invalid_redirect_uri" });
    expect(parseRegistration({ redirect_uris: [] })).toMatchObject({ error: "invalid_redirect_uri" });
    expect(parseRegistration({ redirect_uris: [CB], grant_types: ["client_credentials"] })).toMatchObject({ error: "invalid_client_metadata" });
    expect(parseRegistration({ redirect_uris: [CB], token_endpoint_auth_method: "private_key_jwt" })).toMatchObject({ error: "invalid_client_metadata" });
    expect(parseRegistration(null)).toMatchObject({ error: "invalid_client_metadata" });
  });
});

describe("authorize", () => {
  const client = { redirect_uris: [CB] };
  const good = () =>
    new URLSearchParams({ client_id: "c1", redirect_uri: CB, response_type: "code", code_challenge: CHALLENGE, code_challenge_method: "S256", state: "xyz", scope: "saldi:read", resource: `${ORIGIN}/api/mcp` });

  it("accetta una richiesta corretta", () => {
    expect(parseAuthorize(good(), client, ORIGIN)).toEqual({
      ok: { clientId: "c1", redirectUri: CB, state: "xyz", codeChallenge: CHALLENGE, scope: "saldi:read", resource: `${ORIGIN}/api/mcp` },
    });
  });

  it("client o redirect sconosciuti: errore mostrato, nessun redirect", () => {
    expect(parseAuthorize(good(), null, ORIGIN)).toHaveProperty("fatal");
    const q = good();
    q.set("redirect_uri", "https://evil.example/cb");
    expect(parseAuthorize(q, client, ORIGIN)).toHaveProperty("fatal");
  });

  it("senza PKCE S256, con scope o risorsa sbagliati: errore rimandato al client", () => {
    const noPkce = good();
    noPkce.delete("code_challenge");
    expect(parseAuthorize(noPkce, client, ORIGIN)).toMatchObject({ error: "invalid_request", redirectUri: CB, state: "xyz" });
    const plain = good();
    plain.set("code_challenge_method", "plain");
    expect(parseAuthorize(plain, client, ORIGIN)).toMatchObject({ error: "invalid_request" });
    const scope = good();
    scope.set("scope", "admin");
    expect(parseAuthorize(scope, client, ORIGIN)).toMatchObject({ error: "invalid_scope" });
    const res = good();
    res.set("resource", "https://altro.example/api/mcp");
    expect(parseAuthorize(res, client, ORIGIN)).toMatchObject({ error: "invalid_target" });
  });

  it("redirect omesso: va bene se il client ne ha uno solo", () => {
    const q = good();
    q.delete("redirect_uri");
    expect(parseAuthorize(q, client, ORIGIN)).toHaveProperty("ok");
    expect(parseAuthorize(q, { redirect_uris: [CB, "http://localhost:1/cb"] }, ORIGIN)).toHaveProperty("fatal");
  });

  it("ritorno al client con codice, state e iss", () => {
    const u = new URL(redirectBack(CB, { code: "abc", state: "xyz" }, ORIGIN));
    expect(u.origin + u.pathname).toBe(CB);
    expect(Object.fromEntries(u.searchParams)).toEqual({ code: "abc", state: "xyz", iss: ORIGIN });
  });
});

describe("header", () => {
  it("bearer e credenziali del client", () => {
    expect(bearer("Bearer abc.def")).toBe("abc.def");
    expect(bearer("bearer abc")).toBe("abc");
    expect(bearer("Basic abc")).toBeNull();
    expect(bearer(null)).toBeNull();
    expect(clientCredentials(`Basic ${btoa("id1:sec%3A1")}`, new URLSearchParams())).toEqual({ id: "id1", secret: "sec:1", basic: true });
    expect(clientCredentials(null, new URLSearchParams({ client_id: "id2", client_secret: "s" }))).toEqual({ id: "id2", secret: "s", basic: false });
  });
});

# Saldi

Dashboard personale con i saldi di tutti i conti bancari, via open banking PSD2 ([Enable Banking](https://enablebanking.com), modalità *restricted* gratuita).
Next.js 16 · deploy su Vercel · protetta da password · storage su Upstash Redis.

## Come funziona

- **Login**: password unica (`APP_PASSWORD`), cookie `httpOnly` firmato (HS256, 7 giorni). Il `proxy.ts` blocca ogni pagina e API senza cookie valido.
- **Collegamento banca**: `/connect` → Enable Banking → SCA sulla tua banca → `/api/eb/callback` salva la sessione (id, conti, scadenza consenso) su Redis.
- **Saldi**: la dashboard legge `/accounts/{uid}/balances` per ogni conto, con header PSU (utente presente, quindi niente limite di 4 letture/giorno), e tiene i saldi in cache per 30 minuti. "Aggiorna" svuota la cache.
- **Consenso**: dura al massimo quanto consente la banca (di solito 180 giorni). Da 14 giorni prima della scadenza compare un avviso; per rinnovare basta ricollegare la banca.

## Setup

### 1. Enable Banking
1. Registrati su https://enablebanking.com/cp e crea un'applicazione **Production**.
   - Chiave: *Generate in the browser* → scarica il `.pem`.
   - Redirect URL: `https://<tuo-progetto>.vercel.app/api/eb/callback` (e `http://localhost:3000/api/eb/callback` se vuoi testare in locale, se accettato).
   - Privacy/Terms URL: in modalità restricted non vengono validati (va bene una pagina qualsiasi, es. un gist).
2. **Activate by linking accounts**: collega nel Control Panel i tuoi conti (Poste, BBVA, Revolut…). In modalità restricted l'API restituisce **solo** i conti collegati qui.
3. Annota l'**Application ID**.

### 2. Vercel
1. Importa il repo su Vercel.
2. Storage → Marketplace → **Upstash Redis** (piano free) → collegalo al progetto (imposta `KV_REST_API_URL` / `KV_REST_API_TOKEN`).
3. Environment Variables:
   - `APP_PASSWORD`: la tua password
   - `AUTH_SECRET`: `openssl rand -base64 48`
   - `EB_APP_ID`: Application ID
   - `EB_PRIVATE_KEY`: `base64 -w0 chiave.pem` (Linux) / `base64 -i chiave.pem` (macOS)
4. Deploy, apri il sito, fai login, **+ Banca** e collega ogni banca.

### Locale
```bash
cp .env.example .env.local   # compila i valori
npm install
npm run dev
```

## Note di sicurezza
- La chiave `.pem` e le env non vanno mai committate (`.gitignore` copre `.env*` e `*.pem`).
- L'app è in sola lettura: niente pagamenti.
- Pagine marcate `noindex`. Login rallentato di 1,5 s sui tentativi errati.
- Per revocare l'accesso: **Scollega** nella dashboard (chiude anche il consenso lato banca).

## Limiti
- Trade Republic / Scalable: via PSD2 si vede solo la liquidità del conto, non il valore del portafoglio.
- Alcune banche italiane richiedono di rifare la SCA periodicamente anche prima dei 180 giorni.

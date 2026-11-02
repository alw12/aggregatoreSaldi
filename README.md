# Saldi

Dashboard personale con i saldi di tutti i conti bancari, via open banking PSD2 ([Enable Banking](https://enablebanking.com), modalità *restricted* gratuita).
Next.js 16 · deploy su Vercel · protetta da password · storage su Upstash Redis.

## Come funziona

- **Login**: password unica (`APP_PASSWORD`), cookie `httpOnly` firmato (HS256, 7 giorni). Il `proxy.ts` blocca ogni pagina e API senza cookie valido.
- **Utente bot** (facoltativo): con `BOT_PASSWORD` si può entrare anche con una seconda password, pensata per bot e automazioni. Le sue sessioni sono firmate con una chiave propria: cambiare o togliere `BOT_PASSWORD` disconnette solo il bot, senza toccare le sessioni del proprietario. Da script: `curl -c cookie.txt -d password=$BOT_PASSWORD https://<host>/api/login`, poi `curl -b cookie.txt https://<host>/api/portfolio`.
- **Collegamento banca**: `/connect` → Enable Banking → SCA sulla tua banca → `/api/eb/callback` salva la sessione (id, conti, scadenza consenso) su Redis.
- **Saldi**: la dashboard legge `/accounts/{uid}/balances` per ogni conto, con header PSU (utente presente, quindi niente limite di 4 letture/giorno), e mostra subito l'ultima lettura salvata: se ha più di 5 minuti la rilegge dalla banca in background e la pagina si aggiorna da sola appena finito; con l'app aperta rilegge anche quando torni sull'app e ogni 5 minuti. "Aggiorna" aspetta la banca (al massimo 10 secondi); i conti che non rispondono restano con l'ultimo saldo letto, segnato con la data.
- **Portafoglio**: posizioni per broker (Trade Republic, Scalable Capital) a prezzi live Yahoo, con riserva justETF/CoinGecko. Con il prezzo medio di carico mostra guadagno e perdita; somma lo stesso ISIN tenuto su più broker e divide per tipo (azioni, oro, materie prime, crypto…).
- **Sincronizzazione Scalable**: una routine Claude settimanale legge le posizioni dal connettore Scalable e le invia a `POST /api/portfolio/sync` con `Authorization: Bearer $SYNC_TOKEN`. Body `{ "broker": "Scalable Capital", "positions": [{ "id": "ISIN", "name": "…", "qty": 1.23, "avgCost": 98.4, "price": 101.2 }] }`: sostituisce tutte le posizioni di quel broker.
- **Importa elenco**: in Portafoglio si incolla un elenco "ISIN quote [prezzo medio]" (tab, `;` o spazi; crypto TR `XF000BTC0017` → `BTC-EUR`) con anteprima; aggiunge/aggiorna o sostituisce le posizioni di un broker.
- **Movimenti**: `/accounts/{uid}/transactions` degli ultimi 120 giorni (cache 6 ore): entrate, uscite, risparmio investito (bonifici verso broker) e tasso di risparmio mese per mese. Le medie alimentano il simulatore di *Verso il milione*.
- **Debiti**: con rata e TAEG mostra quando finisce il prestito, gli interessi residui e quanto si risparmia restituendo prima (penale massima art. 125-sexies TUB).
- **Job giornaliero**: Vercel Cron (`vercel.json`, 19:00 UTC) chiama `GET /api/cron/daily` con `Authorization: Bearer $CRON_SECRET`: salva la fotografia del patrimonio anche nei giorni in cui non apri l'app e invia le notifiche push degli avvisi nuovi (consenso in scadenza, carta oltre l'80% o in addebito, debito in scadenza, buono scaduto). Ogni avviso si ripete al massimo una volta a settimana.
- **App sul telefono**: manifest e icone per "Aggiungi alla schermata Home"; su iPhone le notifiche push funzionano solo così (iOS 16.4+). Il service worker (`public/sw.js`) gestisce solo le notifiche, nessuna cache.
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
   - `BOT_PASSWORD` (opzionale): password dell'utente bot
   - `AUTH_SECRET`: `openssl rand -base64 48`
   - `EB_APP_ID`: Application ID
   - `EB_PRIVATE_KEY`: `base64 -w0 chiave.pem` (Linux) / `base64 -i chiave.pem` (macOS)
   - `SYNC_TOKEN` (facoltativo): `openssl rand -hex 32`, per la sincronizzazione automatica del portafoglio
   - `CRON_SECRET`: `openssl rand -hex 32`, per il job giornaliero
   - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (facoltative): `npx web-push generate-vapid-keys`, per le notifiche push
4. Deploy, apri il sito, fai login, **+ Banca** e collega ogni banca.

### Locale
```bash
cp .env.example .env.local   # compila i valori
npm install
npm run dev
npm test        # vitest: numeri, simulatore, prestiti, import, movimenti, avvisi
```

## Note di sicurezza
- La chiave `.pem` e le env non vanno mai committate (`.gitignore` copre `.env*` e `*.pem`).
- L'app è in sola lettura: niente pagamenti.
- Pagine marcate `noindex`. Login rallentato di 1,5 s sui tentativi errati.
- Per revocare l'accesso: **Scollega** nella dashboard (chiude anche il consenso lato banca).

## Limiti
- Trade Republic / Scalable: via PSD2 si vede solo la liquidità del conto; le posizioni (ETF, oro, crypto) si inseriscono in **Portafoglio**, scegliendo il broker, e vengono valorizzate a prezzi di mercato.
- Alcune banche italiane richiedono di rifare la SCA periodicamente anche prima dei 180 giorni.

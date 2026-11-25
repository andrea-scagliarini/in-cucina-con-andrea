# 🍳 In cucina con Andrea — blog fullstack

Riscrittura completa del blog: **API Node.js + SQLite** e **frontend SPA** con effetti visivi e sonori.
Zero dipendenze npm: usa solo Node ≥ 22.13 (`node:http`, `node:sqlite`, `node:crypto`, Web Audio, Canvas).

## Avvio

**Windows:** doppio clic su `start.bat` (avvia, riavvia da solo se va in crash e apre il browser) e su `stop.bat` per fermarlo.
Imposta `NO_BROWSER=1` per non aprire il browser.

```bash
npm start            # http://127.0.0.1:3000
npm run dev          # con riavvio automatico
npm test             # test d'integrazione dell'API
```

Al **primo avvio** viene creato l'utente admin. Se non imposti `ADMIN_PASSWORD`, la password casuale viene
stampata in console e salvata in `data/admin-credentials.txt` (cartella ignorata da git).
Pannello autore: **/admin**.

### Variabili d'ambiente

| Variabile | Default | Note |
|---|---|---|
| `PORT` / `HOST` | `3000` / `127.0.0.1` | usa `HOST=0.0.0.0` per esporre in rete |
| `DATA_DIR` | `./data` | database SQLite, upload, segreto di firma |
| `ADMIN_USER` / `ADMIN_PASSWORD` | `admin` / casuale | solo al primo avvio |
| `SESSION_SECRET` | generato in `data/.secret` | firma dei token |
| `SITE_URL` | dal `Host` | usato in sitemap, feed e Open Graph |
| `NODE_ENV=production` | | abilita la cache dell'HTML |
| `OWNER_NAME` / `OWNER_EMAIL` | vuoti | titolare e contatto mostrati nell'informativa privacy e nei dati strutturati. **Impostali prima di pubblicare** |
| `BACKUP_EVERY_HOURS` / `BACKUP_KEEP` | `24` / `14` | frequenza e numero di backup conservati (`0` = disattivati) |

## Immagini, SEO, backup e privacy

**Immagini.** Le immagini caricate dal pannello (o scaricate da un URL esterno) vengono ospitate in `data/uploads`.
Con [`sharp`](https://sharp.pixelplumbing.com) installato (`npm install --save-optional sharp`) diventano WebP in tre
larghezze (480/960/1600) con `srcset`, auto-rotazione e rimozione dei metadati EXIF/GPS. Senza `sharp` il blog funziona
lo stesso e salva l'originale così com'è. Il pulsante *Ospita le immagini in locale* (admin → Manutenzione) scarica
quelle ancora collegate a siti esterni; il downloader accetta solo `http(s)` su porte 80/443, risolve il DNS prima di
connettersi e blocca indirizzi privati/loopback/link-local (anti-SSRF).

**SEO.** Ogni ricetta pubblica il JSON-LD `schema.org/Recipe` (tempi, ingredienti, passaggi, voti) e un link canonico;
la home pubblica `WebSite` + `SearchAction`. Le pagine inesistenti e `/admin` sono `noindex`.

**Backup.** Un backup automatico del database all'avvio e poi ogni `BACKUP_EVERY_HOURS` in `data/backups`
(`VACUUM INTO`, sicuro anche a server acceso). `npm run backup` ne crea uno subito; `npm run restore` elenca i
backup, `npm run restore -- <nome>` ripristina (con il server fermo) dopo aver verificato l'integrità e salvato il
database corrente. Le **immagini** (`data/uploads`) non sono nel backup del database: copia anche quella cartella.

**Privacy.** Pagina `/privacy`, consenso esplicito (con data) per la newsletter e cancellazione autonoma dell'indirizzo.
Il testo è un modello tecnico accurato per ciò che il blog fa oggi, **non una consulenza legale**: fallo rivedere e
aggiorna l'informativa se aggiungi analytics, pubblicità o altri servizi.

**Contrasti.** `npm run contrast` verifica il rispetto di WCAG AA (4.5:1 testo, 3:1 testo grande) per le coppie di
colori dei design token, in entrambi i temi. Esce con errore se una coppia scende sotto soglia.

## Architettura

```
server/
  index.js        bootstrap, shutdown pulito (buildServer è usato anche dai test)
  app.js          handler HTTP: sicurezza, API, static, SPA fallback + meta SEO, sitemap/RSS
  config.js       configurazione da env
  db.js           schema SQLite, transazioni, slug
  seed.js         ricette iniziali
  validate.js     validazione/sanitizzazione input (ricette, commenti, email, magic bytes immagini)
  routes/api.js   tutti gli endpoint REST
  lib/            router, http utils (gzip, body limit), auth (scrypt + token HMAC, rate limit), SSE
public/
  index.html      shell (CSP senza script inline)
  css/            tokens (design tokens + temi) · base · components · views
  js/
    main.js       bootstrap: tema, suoni, scorciatoie, PWA
    router.js     History API + View Transitions + ripristino scroll
    api.js        client fetch + SSE in tempo reale
    store.js      preferiti, preferenze, sessione (localStorage)
    audio/        motore Web Audio (suoni sintetizzati)
    fx/           particelle canvas, cursore, tilt 3D, parallax, reveal
    ui/           html`` con escape automatico, toast, formattatori
    views/        home · recipe · pages · admin · shared
  sw.js           service worker (offline)
```

### API

| Metodo | Percorso | Accesso |
|---|---|---|
| GET | `/api/recipes?q&category&tag&difficulty&sort&page&limit&ids&maxMinutes` | pubblico |
| GET | `/api/recipes/:slug` | pubblico (conta le viste) |
| POST | `/api/recipes/:id/like` · `/rate` · `/comments` | pubblico, rate-limited |
| POST | `/api/newsletter` | pubblico, rate-limited |
| GET | `/api/meta` · `/api/events` (SSE) | pubblico |
| POST | `/api/auth/login` · GET `/api/auth/me` | login rate-limited |
| POST/PUT/DELETE | `/api/recipes`, `/api/recipes/:id` | admin |
| POST | `/api/upload` (immagine raw, ≤ 5 MB) | admin |
| GET/DELETE | `/api/admin/stats`, `/api/admin/subscribers`, `/api/comments/:id` | admin |

Inoltre: `/sitemap.xml`, `/robots.txt`, `/feed.xml`.

## Funzionalità

**Contenuti**: ricerca full-text, filtri per categoria, ordinamento, scroll infinito, ricetta in evidenza, "Sorprendimi", preferiti.
**Ricetta**: porzioni scalabili con frazioni (½ ¼), ingredienti spuntabili (salvati), timer per passaggio con campana,
**modalità cucina** (un passaggio per volta, frecce, lettura vocale it-IT, schermo sempre acceso), voto a stelle, commenti e like
**in tempo reale** (SSE), condivisione, stampa pulita.
**Admin**: login, statistiche, CRUD ricette, bozze, upload con drag & drop, moderazione commenti, export CSV iscritti.
**Visivo**: tema chiaro/scuro con transizione circolare, braci/farina animate su canvas che reagiscono al mouse, scintille del cursore,
cursore personalizzato, tilt 3D con riflesso sulle card, titolo animato lettera per lettera, parallax, magnetic buttons,
coriandoli a tema cucina, transizioni tra pagine (View Transitions), skeleton loader.
**Sonoro** (attivabile dall'altoparlante, `M`): click, hover, like, stelle, spunta ingredienti, whoosh di pagina, sfrigolio, taglio,
campana del timer e **atmosfera da cucina** (`A`) — tutto sintetizzato con Web Audio.
**Tastiera**: `/` cerca · `T` tema · `M` suoni · `A` atmosfera · ←/→ in modalità cucina.
**Accessibilità**: skip-link, focus visibile, ARIA, `prefers-reduced-motion` rispettato (niente particelle né animazioni).
**PWA**: installabile, funziona offline in lettura.

## Sicurezza

CSP restrittiva, header di sicurezza, escape automatico nei template, password con scrypt, token HMAC con scadenza,
rate limiting su login/commenti/like/newsletter, query parametrizzate (e `LIKE` con escape), validazione di tutti gli input,
upload verificato dai magic bytes (non dall'estensione), protezione path traversal sui file statici, limiti di dimensione dei body.

## File originali

`blogcucina.html` e `style.css` nella radice sono la versione precedente e non vengono toccati: le ricette originali
sono state migrate nel database (`server/seed.js`).

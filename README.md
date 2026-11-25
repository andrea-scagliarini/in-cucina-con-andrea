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

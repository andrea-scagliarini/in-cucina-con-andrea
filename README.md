# 🍳 In cucina con Andrea

**Blog di cucina pugliese full stack, con API Node.js + SQLite e frontend SPA, senza dipendenze npm obbligatorie.**

![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A5%2022.13-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-node%3Asqlite-003B57?style=flat-square&logo=sqlite&logoColor=white)
![JavaScript](https://img.shields.io/badge/Vanilla-JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![PWA](https://img.shields.io/badge/PWA-installabile-5A0FC8?style=flat-square&logo=pwa&logoColor=white)

## In breve

- **Solo piattaforma:** `node:http`, `node:sqlite`, `node:crypto`, Web Audio e Canvas
- **Esperienza in cucina:** porzioni scalabili, timer per passaggio, lettura vocale, schermo sempre acceso
- **Tempo reale:** voti, commenti e like tramite Server-Sent Events
- **Gestione contenuti:** pannello autore con bozze, upload, moderazione ed export CSV
- **Qualità:** test d'integrazione dell'API, verifica dei contrasti WCAG AA, backup automatici

## Avvio rapido

Richiede **Node.js 22.13 o superiore**.

```bash
npm start        # http://127.0.0.1:3000
npm run dev      # riavvio automatico
npm test         # test d'integrazione dell'API
```

**Windows:** `start.bat` avvia il server, lo riavvia in caso di crash e apre il browser; `stop.bat` lo ferma. Con `NO_BROWSER=1` il browser non si apre.

Al primo avvio viene creato l'utente admin. Senza `ADMIN_PASSWORD`, la password casuale viene stampata in console e salvata in `data/admin-credentials.txt` (ignorata da git). Pannello autore: `/admin`.

## Funzionalità

| Area | Dettagli |
|---|---|
| **Contenuti** | Ricerca full-text, filtri, ordinamento, scroll infinito, ricetta in evidenza, "Sorprendimi", preferiti |
| **Ricetta** | Porzioni con frazioni, ingredienti spuntabili, timer, modalità cucina, voti, commenti, condivisione, stampa |
| **Admin** | Login, statistiche, CRUD ricette, bozze, upload drag & drop, moderazione, export iscritti |
| **Interfaccia** | Tema chiaro/scuro, animazioni su canvas, tilt 3D, parallax, View Transitions, skeleton loader |
| **Audio** | Effetti e atmosfera da cucina sintetizzati con Web Audio |
| **Accessibilità** | Skip link, focus visibile, ARIA, rispetto di `prefers-reduced-motion` |
| **PWA** | Installabile, lettura offline |

Scorciatoie: `/` cerca · `T` tema · `M` suoni · `A` atmosfera · `←` `→` in modalità cucina.

## Architettura

```
server/
  index.js        bootstrap e shutdown pulito
  app.js          handler HTTP: sicurezza, API, file statici, meta SEO, sitemap/RSS
  config.js       configurazione da variabili d'ambiente
  db.js           schema SQLite, transazioni, slug
  seed.js         ricette iniziali
  validate.js     validazione e sanitizzazione degli input
  routes/api.js   endpoint REST
  lib/            router, utility HTTP, autenticazione, SSE
public/
  index.html      shell con CSP senza script inline
  css/            design token, base, componenti, viste
  js/             router, client API, store, audio, effetti, interfaccia, viste
  sw.js           service worker
```

## API

| Metodo | Percorso | Accesso |
|---|---|---|
| `GET` | `/api/recipes?q&category&tag&difficulty&sort&page&limit&ids&maxMinutes` | Pubblico |
| `GET` | `/api/recipes/:slug` | Pubblico (conta le viste) |
| `POST` | `/api/recipes/:id/like` · `/rate` · `/comments` | Pubblico, con rate limit |
| `POST` | `/api/newsletter` | Pubblico, con rate limit |
| `GET` | `/api/meta` · `/api/events` | Pubblico |
| `POST` / `GET` | `/api/auth/login` · `/api/auth/me` | Login con rate limit |
| `POST` `PUT` `DELETE` | `/api/recipes` · `/api/recipes/:id` | Admin |
| `POST` | `/api/upload` (immagine, max 5 MB) | Admin |
| `GET` / `DELETE` | `/api/admin/stats` · `/api/admin/subscribers` · `/api/comments/:id` | Admin |

Disponibili anche `/sitemap.xml`, `/robots.txt` e `/feed.xml`.

## Sicurezza

- CSP restrittiva, header di sicurezza ed escape automatico nei template
- Password con scrypt e token HMAC con scadenza
- Rate limiting su login, commenti, like e newsletter
- Query parametrizzate e validazione di tutti gli input
- Upload verificati dai magic bytes, protezione da path traversal, limiti sui body
- Download di immagini esterne protetto da SSRF

## Configurazione

| Variabile | Default | Note |
|---|---|---|
| `PORT` / `HOST` | `3000` / `127.0.0.1` | `HOST=0.0.0.0` per esporre in rete |
| `DATA_DIR` | `./data` | Database, upload, segreto di firma |
| `ADMIN_USER` / `ADMIN_PASSWORD` | `admin` / casuale | Solo al primo avvio |
| `SESSION_SECRET` | Generato in `data/.secret` | Firma dei token |
| `SITE_URL` | Dall'header `Host` | Sitemap, feed, Open Graph |
| `NODE_ENV=production` | | Abilita la cache dell'HTML |
| `OWNER_NAME` / `OWNER_EMAIL` | Vuoti | Informativa privacy e dati strutturati: **impostare prima di pubblicare** |
| `BACKUP_EVERY_HOURS` / `BACKUP_KEEP` | `24` / `14` | `0` disattiva i backup |

## Gestione e manutenzione

**Immagini.** Salvate in `data/uploads`. Con [`sharp`](https://sharp.pixelplumbing.com) (`npm install --save-optional sharp`) diventano WebP a 480, 960 e 1600 px con `srcset`, auto-rotazione e rimozione dei metadati EXIF/GPS; senza, viene salvato l'originale. Da *admin → Manutenzione* si possono ospitare in locale le immagini esterne (solo `http(s)` sulle porte 80/443, con blocco degli indirizzi privati).

**Backup.** `npm run backup` crea un backup immediato; `npm run restore` elenca i backup e `npm run restore -- <nome>` ripristina a server fermo, dopo la verifica di integrità e il salvataggio del database corrente. La cartella `data/uploads` va copiata a parte.

**SEO.** JSON-LD `schema.org/Recipe`, link canonici, `WebSite` + `SearchAction`; pagine inesistenti e `/admin` sono `noindex`.

**Contrasti.** `npm run contrast` verifica le soglie WCAG AA nei due temi.

**Privacy.** Pagina `/privacy`, consenso datato per la newsletter e cancellazione autonoma. Il testo è un modello tecnico, **non una consulenza legale**: va rivisto prima della pubblicazione e a ogni nuovo servizio.

## Versione precedente

`blogcucina.html` e `style.css` nella radice sono la versione originale; le ricette sono state migrate in `server/seed.js`.

---

Sviluppato da [Andrea Scagliarini](https://github.com/andrea-scagliarini)

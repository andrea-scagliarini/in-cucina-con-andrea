import { createHash, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { HttpError, MIME, send, sendJson, escXml } from './lib/http.js';
import { runChain } from './lib/router.js';
import { verifyToken, loadSecret, RateLimiter } from './lib/auth.js';
import { EventHub } from './lib/events.js';
import { buildApi, HANDLED, shapeRecipe } from './routes/api.js';

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Crea l'handler HTTP + risorse da chiudere allo shutdown. */
export function createApp({ db, config }) {
  mkdirSync(config.uploadsDir, { recursive: true });
  const secret = loadSecret(config);
  const events = new EventHub();
  const limiter = new RateLimiter();
  const api = buildApi({ db, config, events, limiter, secret });
  let indexHtml = null;

  const origin = (req) => config.siteUrl || `http://${req.headers.host ?? 'localhost'}`;

  async function getIndex() {
    if (!indexHtml || process.env.NODE_ENV !== 'production') indexHtml = await readFile(resolve(config.publicDir, 'index.html'), 'utf8');
    return indexHtml;
  }

  /* ---------- API ---------- */
  async function handleApi(req, res, url) {
    const m = api.match(req.method, url.pathname);
    if (!m) throw new HttpError(404, 'Endpoint non trovato');
    if (m.methodNotAllowed) throw new HttpError(405, 'Metodo non consentito');

    const ip = req.socket.remoteAddress ?? 'unknown';
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    const header = String(req.headers['x-client-id'] ?? '');
    const ctx = {
      req, res, url, ip,
      query: url.searchParams,
      params: m.params,
      user: bearer ? verifyToken(bearer, secret) : null,
      clientId: /^[a-zA-Z0-9-]{16,64}$/.test(header) ? header : `ip:${createHash('sha256').update(ip).digest('hex').slice(0, 24)}`,
    };

    const out = await runChain(m.handlers, ctx);
    if (out === HANDLED) return;
    if (out === undefined) return send(req, res, 204, '');
    if (out.__reply) return sendJson(req, res, out.status, out.body);
    return sendJson(req, res, 200, out);
  }

  /* ---------- SEO: sitemap, robots, feed RSS ---------- */
  function publishedRecipes() {
    return db.prepare('SELECT * FROM recipes WHERE published = 1 ORDER BY created_at DESC, id DESC').all();
  }

  function special(req, res, url) {
    const base = origin(req);
    const xml = { 'Content-Type': MIME['.xml'], 'Cache-Control': 'public, max-age=600' };
    if (url.pathname === '/robots.txt') {
      send(req, res, 200, `User-agent: *\nDisallow: /admin\nDisallow: /api/\nSitemap: ${base}/sitemap.xml\n`, { 'Content-Type': MIME['.txt'] });
      return true;
    }
    if (url.pathname === '/sitemap.xml') {
      const urls = ['/', '/chi-sono', ...publishedRecipes().map((r) => `/ricette/${r.slug}`)];
      send(req, res, 200,
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
          .map((u) => `<url><loc>${escXml(base + u)}</loc></url>`).join('')}</urlset>`, xml);
      return true;
    }
    if (url.pathname === '/feed.xml') {
      const items = publishedRecipes().slice(0, 20).map((r) => `<item><title>${escXml(r.title)}</title><link>${escXml(`${base}/ricette/${r.slug}`)}</link><guid>${escXml(`${base}/ricette/${r.slug}`)}</guid><description>${escXml(r.excerpt)}</description><pubDate>${new Date(`${r.created_at.replace(' ', 'T')}Z`).toUTCString()}</pubDate></item>`).join('');
      send(req, res, 200,
        `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escXml(config.siteName)}</title><link>${escXml(base)}</link><description>Ricette di cucina pugliese e non solo</description><language>it</language>${items}</channel></rss>`,
        { ...xml, 'Content-Type': 'application/rss+xml; charset=utf-8' });
      return true;
    }
    return false;
  }

  /* ---------- Static + SPA fallback con meta tag SEO per ricetta ---------- */
  async function serveIndex(req, res, url, forceStatus) {
    let page = await getIndex();
    const base = origin(req);
    let title = `${config.siteName} · ricette, sapori e musica del fornello`;
    let desc = 'Un blog di cucina pugliese e non solo: ricette passo passo, timer, modalità cucina e tanta atmosfera.';
    let image = '';
    let status = 200;
    const m = /^\/ricette\/([^/]+)\/?$/.exec(url.pathname);
    if (m) {
      const row = db.prepare('SELECT * FROM recipes WHERE slug = ? AND published = 1').get(decodeURIComponent(m[1]));
      if (row) {
        const r = shapeRecipe(row);
        title = `${r.title} · ${config.siteName}`;
        desc = r.excerpt || desc;
        image = r.image.startsWith('/') ? base + r.image : r.image;
      } else status = 404;
    }
    const meta = [
      `<title>${esc(title)}</title>`,
      `<meta name="description" content="${esc(desc)}">`,
      `<meta property="og:title" content="${esc(title)}">`,
      `<meta property="og:description" content="${esc(desc)}">`,
      '<meta property="og:type" content="website">',
      `<meta property="og:url" content="${esc(base + url.pathname)}">`,
      image ? `<meta property="og:image" content="${esc(image)}">` : '',
      '<meta name="twitter:card" content="summary_large_image">',
    ].join('\n    ');
    page = page.replace('<!--meta-->', meta);
    send(req, res, forceStatus ?? status, page, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
  }

  async function serveFile(req, res, root, relPath, cache) {
    const file = resolve(root, `.${sep}${relPath}`);
    if (file !== root && !file.startsWith(root + sep)) return false;
    let info;
    try {
      info = await stat(file);
    } catch {
      return false;
    }
    if (!info.isFile()) return false;
    const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
    const headers = {
      'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': cache,
      ETag: etag,
    };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      res.end();
      return true;
    }
    send(req, res, 200, await readFile(file), headers);
    return true;
  }

  async function handleStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Metodo non consentito');
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      throw new HttpError(400, 'URL non valido');
    }
    if (pathname.includes('\0')) throw new HttpError(400, 'URL non valido');

    if (pathname.startsWith('/uploads/')) {
      if (await serveFile(req, res, config.uploadsDir, pathname.slice('/uploads/'.length), 'public, max-age=31536000, immutable')) return;
      throw new HttpError(404, 'File non trovato');
    }
    if (pathname !== '/' && extname(pathname)) {
      if (await serveFile(req, res, config.publicDir, pathname.slice(1), 'no-cache')) return;
      throw new HttpError(404, 'File non trovato');
    }
    await serveIndex(req, res, url);
  }

  /* ---------- entry point ---------- */
  const handler = async (req, res) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    const started = performance.now();
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
      else if (!special(req, res, url)) await handleStatic(req, res, url);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(`[${new Date().toISOString()}] ${req.method} ${req.url}`, e);
      if (!res.headersSent) {
        const isApi = req.url?.startsWith('/api/');
        const path = new URL(req.url, 'http://localhost').pathname;
        if (isApi || status !== 404) sendJson(req, res, status, { error: status === 500 ? 'Errore interno del server' : e.message });
        else if (extname(path)) send(req, res, 404, 'Non trovato', { 'Content-Type': MIME['.txt'] });
        else await serveIndex(req, res, new URL(path, 'http://localhost'), 404).catch(() => res.end());
      } else res.end();
    }
    if (!config.quiet && process.env.LOG_REQUESTS) {
      console.log(`${req.method} ${req.url} ${res.statusCode} ${(performance.now() - started).toFixed(1)}ms`);
    }
  };

  return { handler, events, close: () => events.close(), newId: randomUUID };
}

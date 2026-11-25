/* Primo gruppo di migliorie: SEO (JSON-LD), immagini/SSRF, backup, migrazioni, privacy. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildServer } from '../server/index.js';
import { openDb } from '../server/db.js';
import { createBackup, listBackups } from '../server/lib/backup.js';
import { isPublicAddress, fetchRemoteImage } from '../server/lib/images.js';

let srv, base, token;
const CID = 'improv-client-0123456789abc';

const call = async (path, { method = 'GET', body, auth, raw } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: {
      'x-client-id': CID,
      ...(body && !raw ? { 'content-type': 'application/json' } : {}),
      ...(auth ? { authorization: `Bearer ${auth}` } : {}),
    },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
};

const jsonLd = (html) => {
  const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  return m ? JSON.parse(m[1]) : null;
};

before(async () => {
  srv = buildServer({
    dbFile: ':memory:',
    dataDir: mkdtempSync(join(tmpdir(), 'blog-imp-')),
    adminPassword: 'segreta-di-test',
    sessionSecret: 'y'.repeat(32),
    ownerName: 'Andrea Test',
    ownerEmail: 'privacy@example.test',
    quiet: true,
  });
  await new Promise((r) => srv.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${srv.server.address().port}`;
  token = (await call('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'segreta-di-test' } })).data.token;
});
after(() => srv.close());

test('SEO: dati strutturati Recipe completi, autore e voti aggregati', async () => {
  await call('/api/recipes/2/rate', { method: 'POST', body: { stars: 5 } });
  const html = await (await fetch(`${base}/ricette/cozze-gratinate`)).text();
  const ld = jsonLd(html);
  assert.equal(ld['@type'], 'Recipe');
  assert.equal(ld.name, 'Cozze gratinate');
  assert.equal(ld.author.name, 'Andrea Test');
  assert.equal(ld.totalTime, 'PT45M');
  assert.ok(ld.recipeIngredient.length >= 5 && ld.recipeIngredient[0].includes('cozze'));
  assert.equal(ld.recipeInstructions[0]['@type'], 'HowToStep');
  assert.equal(ld.aggregateRating.ratingCount, 1);
  assert.match(html, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:\d+\/ricette\/cozze-gratinate">/);
});

test('SEO: il JSON-LD non può chiudere il tag script (injection)', async () => {
  const body = { title: 'Pizza </script><img src=x onerror=alert(1)>', category: 'Primi', difficulty: 'Facile', servings: 2, ingredients: [], steps: [{ text: 'x </script>' }] };
  const c = await call('/api/recipes', { method: 'POST', body, auth: token });
  assert.equal(c.status, 201);
  const html = await (await fetch(`${base}/ricette/${c.data.recipe.slug}`)).text();
  assert.equal(html.includes('</script><img'), false, 'nessun tag chiuso prematuramente');
  assert.equal(jsonLd(html).name, body.title, 'il contenuto resta intatto dopo il parsing');
  await call(`/api/recipes/${c.data.recipe.id}`, { method: 'DELETE', auth: token });
});

test('SEO: home con WebSite/SearchAction, privacy indicizzabile, admin noindex', async () => {
  assert.equal(jsonLd(await (await fetch(`${base}/`)).text())['@type'], 'WebSite');
  const privacy = await fetch(`${base}/privacy`);
  assert.equal(privacy.status, 200);
  assert.match(await privacy.text(), /<title>Informativa sulla privacy/);
  assert.match(await (await fetch(`${base}/admin`)).text(), /name="robots" content="noindex, nofollow"/);
  assert.match(await (await fetch(`${base}/sitemap.xml`)).text(), /\/privacy</);
  const missing = await fetch(`${base}/ricette/non-esiste`);
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /name="robots" content="noindex"/);
});

test('upload: immagine valida salvata in locale e servita con cache immutabile', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const r = await call('/api/upload', { method: 'POST', raw: png, auth: token });
  assert.equal(r.status, 201);
  assert.match(r.data.url, /^\/uploads\/[0-9a-f-]{36}(-960\.webp|\.png)$/, 'WebP ottimizzato (con sharp) oppure PNG originale');
  const f = await fetch(base + r.data.url);
  assert.equal(f.status, 200);
  assert.match(f.headers.get('cache-control'), /immutable/);
});

test('immagini remote: nessuna SSRF e la creazione ricetta non fallisce', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.9', '172.16.5.5', '169.254.169.254', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '0.0.0.0'])
    assert.equal(isPublicAddress(ip), false, `${ip} deve essere bloccato`);
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) assert.equal(isPublicAddress(ip), true, `${ip} è pubblico`);
  await assert.rejects(fetchRemoteImage('http://127.0.0.1/x.png'), /non consentito/);
  await assert.rejects(fetchRemoteImage('http://localhost/x.png'), /non consentito/);
  await assert.rejects(fetchRemoteImage('http://169.254.169.254/latest/meta-data'), /non consentito/);
  await assert.rejects(fetchRemoteImage('http://example.com:8080/x.png'), /Porta/);
  await assert.rejects(fetchRemoteImage('ftp://example.com/x.png'), /Protocollo/);
  await assert.rejects(fetchRemoteImage('https://user:pw@example.com/x.png'), /credenziali/);

  // un URL interno non deve impedire di salvare la ricetta: resta il link originale
  const c = await call('/api/recipes', { method: 'POST', auth: token, body: { title: 'Prova immagine', category: 'Primi', image: 'http://127.0.0.1:9/x.png', ingredients: [], steps: [] } });
  assert.equal(c.status, 201);
  assert.equal(c.data.recipe.image, 'http://127.0.0.1:9/x.png');
  // Test ermetico: le ricette d'esempio hanno immagini su siti reali, che non vogliamo scaricare qui.
  srv.db.exec("UPDATE recipes SET image = '' WHERE image LIKE 'http%' AND title != 'Prova immagine'");
  const loc = await call('/api/admin/localize-images', { method: 'POST', auth: token });
  assert.equal(loc.data.total, 1);
  assert.equal(loc.data.done, 0, 'un indirizzo interno non viene mai scaricato');
  await call(`/api/recipes/${c.data.recipe.id}`, { method: 'DELETE', auth: token });
  assert.equal((await call('/api/admin/localize-images', { method: 'POST' })).status, 401);
});

test('backup: creazione via API, integrità e rotazione', async () => {
  assert.equal((await call('/api/admin/backups')).status, 401);
  const made = await call('/api/admin/backups', { method: 'POST', auth: token });
  assert.equal(made.status, 201);
  assert.match(made.data.backup.name, /^blog-\d{8}-\d{9}Z\.db$/);
  const list = await call('/api/admin/backups', { auth: token });
  assert.ok(list.data.items.some((b) => b.name === made.data.backup.name));

  const copy = new DatabaseSync(join(srv.config.backupDir, made.data.backup.name), { readOnly: true });
  assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.ok(copy.prepare('SELECT COUNT(*) AS n FROM recipes').get().n >= 6, 'il backup contiene i dati');
  copy.close();

  const dir = mkdtempSync(join(tmpdir(), 'blog-bk-'));
  for (let i = 0; i < 5; i++) createBackup(srv.db, dir, 3);
  assert.equal(listBackups(dir).length, 3, 'ne restano solo 3');
});

test('migrazioni: un database vecchio viene aggiornato senza perdere dati', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'blog-mig-')), 'old.db');
  const old = new DatabaseSync(file);
  old.exec("CREATE TABLE subscribers (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now')));");
  old.prepare('INSERT INTO subscribers (email) VALUES (?)').run('vecchio@iscritto.it');
  old.close();
  const db = openDb(file);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
  assert.ok(db.prepare('PRAGMA table_info(subscribers)').all().some((c) => c.name === 'consent_at'));
  assert.equal(db.prepare('SELECT email FROM subscribers').get().email, 'vecchio@iscritto.it');
  db.close();
  openDb(file).close(); // riaprire non deve rifare la migrazione né fallire
});

test('privacy: i dati del titolare arrivano dal server', async () => {
  const { data } = await call('/api/meta');
  assert.deepEqual(data.site, { ownerName: 'Andrea Test', ownerEmail: 'privacy@example.test' });
});

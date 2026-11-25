import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer } from '../server/index.js';

let srv, base, token;
const CID = 'test-client-0123456789abcdef';
const OTHER = 'altro-client-0123456789abc';

const call = async (path, { method = 'GET', body, auth, cid = CID, raw } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: {
      'x-client-id': cid,
      ...(body && !raw ? { 'content-type': 'application/json' } : {}),
      ...(auth ? { authorization: `Bearer ${auth}` } : {}),
    },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
};

before(async () => {
  srv = buildServer({
    dbFile: ':memory:',
    dataDir: mkdtempSync(join(tmpdir(), 'blog-test-')),
    adminPassword: 'segreta-di-test',
    sessionSecret: 'x'.repeat(32),
    quiet: true,
  });
  await new Promise((r) => srv.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${srv.server.address().port}`;
  const login = await call('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'segreta-di-test' } });
  token = login.data.token;
});
after(() => srv.close());

test('lista ricette con paginazione e ricerca', async () => {
  const all = await call('/api/recipes?limit=3');
  assert.equal(all.status, 200);
  assert.equal(all.data.items.length, 3);
  assert.ok(all.data.total >= 6);
  const q = await call('/api/recipes?q=cozze');
  assert.equal(q.data.items.length, 1);
  assert.equal(q.data.items[0].slug, 'cozze-gratinate');
  const wild = await call('/api/recipes?q=%25');
  assert.equal(wild.data.total, 0, 'i caratteri LIKE vanno escapati');
});

test('dettaglio ricetta con ingredienti e passaggi', async () => {
  const { status, data } = await call('/api/recipes/orecchiette-e-cime-di-rapa');
  assert.equal(status, 200);
  assert.ok(data.recipe.ingredients.length > 3);
  assert.ok(data.recipe.steps.some((s) => s.timer));
  assert.equal((await call('/api/recipes/non-esiste')).status, 404);
});

test('like è un toggle per client', async () => {
  const a = await call('/api/recipes/1/like', { method: 'POST' });
  assert.deepEqual([a.data.liked, a.data.likes], [true, 1]);
  const b = await call('/api/recipes/1/like', { method: 'POST', cid: OTHER });
  assert.equal(b.data.likes, 2);
  const c = await call('/api/recipes/1/like', { method: 'POST' });
  assert.deepEqual([c.data.liked, c.data.likes], [false, 1]);
});

test('voti: validazione e media', async () => {
  assert.equal((await call('/api/recipes/1/rate', { method: 'POST', body: { stars: 9 } })).status, 400);
  await call('/api/recipes/1/rate', { method: 'POST', body: { stars: 4 } });
  const r = await call('/api/recipes/1/rate', { method: 'POST', body: { stars: 5 }, cid: OTHER });
  assert.equal(r.data.rating.avg, 4.5);
});

test('commenti: validazione e inserimento', async () => {
  assert.equal((await call('/api/recipes/1/comments', { method: 'POST', body: { author: 'A', body: '' } })).status, 400);
  const ok = await call('/api/recipes/1/comments', { method: 'POST', body: { author: 'Maria', body: '<b>Buonissima!</b>' } });
  assert.equal(ok.status, 201);
  const detail = await call('/api/recipes/orecchiette-e-cime-di-rapa');
  assert.equal(detail.data.comments[0].author, 'Maria');
});

test('area admin protetta', async () => {
  assert.equal((await call('/api/admin/stats')).status, 401);
  assert.equal((await call('/api/recipes', { method: 'POST', body: {} })).status, 401);
  assert.equal((await call('/api/admin/stats', { auth: 'x.y' })).status, 401);
  assert.equal((await call('/api/admin/stats', { auth: token })).status, 200);
  const bad = await call('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'no' } });
  assert.equal(bad.status, 401);
});

test('CRUD ricetta da admin', async () => {
  const body = {
    title: 'Tiramisù', excerpt: 'Classico', category: 'Dolci', difficulty: 'Facile', prepMinutes: 30, cookMinutes: 0, servings: 6,
    ingredients: [{ amount: 250, unit: 'g', name: 'mascarpone' }], steps: [{ text: 'Monta i tuorli', timer: 300 }], tags: ['Dolce', 'dolce'],
  };
  const created = await call('/api/recipes', { method: 'POST', body, auth: token });
  assert.equal(created.status, 201);
  assert.equal(created.data.recipe.slug, 'tiramisu');
  assert.deepEqual(created.data.recipe.tags, ['dolce']);
  const id = created.data.recipe.id;
  const upd = await call(`/api/recipes/${id}`, { method: 'PUT', body: { ...body, title: 'Tiramisù veloce', published: false }, auth: token });
  assert.equal(upd.data.recipe.slug, 'tiramisu-veloce');
  assert.equal((await call('/api/recipes/tiramisu-veloce')).status, 404, 'le bozze non sono pubbliche');
  assert.equal((await call('/api/recipes/tiramisu-veloce', { auth: token })).status, 200);
  assert.equal((await call(`/api/recipes/${id}`, { method: 'DELETE', auth: token })).status, 200);
  const invalid = await call('/api/recipes', { method: 'POST', body: { ...body, image: 'javascript:alert(1)' }, auth: token });
  assert.equal(invalid.status, 400);
});

test('upload accetta solo immagini reali', async () => {
  const txt = await call('/api/upload', { method: 'POST', raw: Buffer.from('<script>alert(1)</script>'), auth: token });
  assert.equal(txt.status, 415);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
  const ok = await call('/api/upload', { method: 'POST', raw: png, auth: token });
  assert.equal(ok.status, 201);
  const file = await fetch(base + ok.data.url);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'image/png');
});

test('newsletter: consenso obbligatorio, iscrizione e cancellazione', async () => {
  assert.equal((await call('/api/newsletter', { method: 'POST', body: { email: 'non-valida', consent: true } })).status, 400);
  const noConsent = await call('/api/newsletter', { method: 'POST', body: { email: 'a@b.it' } });
  assert.equal(noConsent.status, 400, 'senza consenso non ci si iscrive');
  assert.equal((await call('/api/newsletter', { method: 'POST', body: { email: 'a@b.it', consent: true } })).status, 201);
  assert.equal((await call('/api/newsletter', { method: 'POST', body: { email: 'a@b.it', consent: true } })).data.already, true);
  const row = srv.db.prepare('SELECT consent_at FROM subscribers WHERE email = ?').get('a@b.it');
  assert.ok(row.consent_at, 'la data del consenso viene registrata');
  // cancellazione: stessa risposta se l'indirizzo esiste o no (niente enumerazione)
  const del = await call('/api/newsletter/unsubscribe', { method: 'POST', body: { email: 'a@b.it' } });
  const none = await call('/api/newsletter/unsubscribe', { method: 'POST', body: { email: 'mai-iscritto@b.it' } });
  assert.deepEqual(del.data, none.data);
  assert.equal(srv.db.prepare('SELECT COUNT(*) AS n FROM subscribers WHERE email = ?').get('a@b.it').n, 0);
});

test('static: sicurezza, SEO e fallback SPA', async () => {
  const idx = await fetch(`${base}/ricette/cozze-gratinate`);
  const html = await idx.text();
  assert.equal(idx.status, 200);
  assert.match(html, /<title>Cozze gratinate/);
  assert.ok(idx.headers.get('content-security-policy'));
  assert.equal((await fetch(`${base}/ricette/non-esiste`)).status, 404);
  assert.equal((await fetch(`${base}/%2e%2e/package.json`)).status, 404);
  assert.match(await (await fetch(`${base}/sitemap.xml`)).text(), /cozze-gratinate/);
  assert.match(await (await fetch(`${base}/feed.xml`)).text(), /<rss/);
});

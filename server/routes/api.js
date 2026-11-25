import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Router } from '../lib/router.js';
import { HttpError, readBody, readJson } from '../lib/http.js';
import { verifyPassword, signToken } from '../lib/auth.js';
import { uniqueSlug } from '../db.js';
import { CATEGORIES, DIFFICULTIES, validateRecipe, validateComment, validateEmail, sniffImage } from '../validate.js';

export const HANDLED = Symbol('handled');
export const reply = (status, body) => ({ __reply: true, status, body });

const SORTS = {
  recent: 'r.created_at DESC, r.id DESC',
  popular: 'r.views DESC, r.id DESC',
  liked: 'likes DESC, r.id DESC',
  quick: '(r.prep_minutes + r.cook_minutes) ASC, r.id DESC',
};

const SELECT_RECIPE = `
  SELECT r.*,
    (SELECT COUNT(*) FROM likes l WHERE l.recipe_id = r.id)                         AS likes,
    (SELECT ROUND(AVG(stars), 2) FROM ratings x WHERE x.recipe_id = r.id)           AS rating_avg,
    (SELECT COUNT(*) FROM ratings x WHERE x.recipe_id = r.id)                       AS rating_count,
    (SELECT COUNT(*) FROM comments c WHERE c.recipe_id = r.id AND c.approved = 1)   AS comments_count
  FROM recipes r`;

const json = (s, fallback) => {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
};

export function shapeRecipe(row, { full = false } = {}) {
  const out = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    category: row.category,
    difficulty: row.difficulty,
    prepMinutes: row.prep_minutes,
    cookMinutes: row.cook_minutes,
    totalMinutes: row.prep_minutes + row.cook_minutes,
    servings: row.servings,
    image: row.image,
    emoji: row.emoji,
    tags: json(row.tags, []),
    views: row.views,
    featured: !!row.featured,
    published: !!row.published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    likes: row.likes ?? 0,
    rating: { avg: row.rating_avg ?? 0, count: row.rating_count ?? 0 },
    commentsCount: row.comments_count ?? 0,
  };
  if (full) {
    out.ingredients = json(row.ingredients, []);
    out.steps = json(row.steps, []);
  }
  return out;
}

const likeEsc = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export function buildApi({ db, config, events, limiter, secret }) {
  const r = new Router();

  /* ---------- middleware ---------- */
  const requireAdmin = (ctx) => {
    if (ctx.user?.role !== 'admin') throw new HttpError(401, 'Autenticazione richiesta');
  };
  const rateLimit = (name, max, windowMs) => (ctx) => {
    if (!limiter.allow(`${name}:${ctx.ip}`, max, windowMs)) throw new HttpError(429, 'Troppe richieste, riprova tra poco');
  };
  const recipeOr404 = (id) => {
    const row = db.prepare(`${SELECT_RECIPE} WHERE r.id = ?`).get(Number(id));
    if (!row) throw new HttpError(404, 'Ricetta non trovata');
    return row;
  };

  /* ---------- auth ---------- */
  r.post('/api/auth/login', rateLimit('login', 10, 15 * 60_000), async (ctx) => {
    const { username = '', password = '' } = await readJson(ctx.req, config.maxJsonBytes);
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username));
    // Esegue sempre una verifica per rendere simile il tempo di risposta.
    const ok = verifyPassword(String(password), user?.password_hash ?? 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
    if (!user || !ok) throw new HttpError(401, 'Credenziali non valide');
    const token = signToken({ sub: user.id, name: user.username, role: user.role }, secret, config.tokenTtlSec);
    return { token, user: { name: user.username, role: user.role } };
  });

  r.get('/api/auth/me', (ctx) => {
    requireAdmin(ctx);
    return { user: { name: ctx.user.name, role: ctx.user.role } };
  });

  /* ---------- meta ---------- */
  r.get('/api/meta', () => {
    const categories = db
      .prepare('SELECT category AS name, COUNT(*) AS count FROM recipes WHERE published = 1 GROUP BY category ORDER BY count DESC')
      .all();
    const tags = {};
    for (const { tags: t } of db.prepare('SELECT tags FROM recipes WHERE published = 1').all())
      for (const tag of json(t, [])) tags[tag] = (tags[tag] ?? 0) + 1;
    const stats = db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM recipes WHERE published = 1) AS recipes,
                (SELECT COALESCE(SUM(views), 0) FROM recipes) AS views,
                (SELECT COUNT(*) FROM likes) AS likes,
                (SELECT COUNT(*) FROM comments WHERE approved = 1) AS comments`,
      )
      .get();
    return {
      categories,
      allCategories: CATEGORIES,
      difficulties: DIFFICULTIES,
      tags: Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([name, count]) => ({ name, count })),
      stats,
      live: events.size,
    };
  });

  /* ---------- ricette: lettura ---------- */
  r.get('/api/recipes', (ctx) => {
    const q = ctx.query;
    const where = [];
    const args = [];
    const showAll = ctx.user?.role === 'admin' && q.get('all') === '1';
    if (!showAll) where.push('r.published = 1');

    const ids = (q.get('ids') ?? '').split(',').map(Number).filter(Number.isInteger).slice(0, 100);
    if (q.has('ids')) {
      if (!ids.length) return { items: [], total: 0, page: 1, pages: 1 };
      where.push(`r.id IN (${ids.map(() => '?').join(',')})`);
      args.push(...ids);
    }
    const cat = q.get('category');
    if (cat) (where.push('r.category = ?'), args.push(cat));
    const diff = q.get('difficulty');
    if (diff) (where.push('r.difficulty = ?'), args.push(diff));
    const tag = q.get('tag');
    if (tag) (where.push(`r.tags LIKE ? ESCAPE '\\'`), args.push(`%"${likeEsc(tag.toLowerCase())}"%`));
    if (q.get('featured') === '1') where.push('r.featured = 1');
    const maxMin = Number(q.get('maxMinutes'));
    if (maxMin > 0) (where.push('(r.prep_minutes + r.cook_minutes) <= ?'), args.push(maxMin));
    const term = (q.get('q') ?? '').trim().slice(0, 60);
    if (term) {
      const like = `%${likeEsc(term)}%`;
      where.push(`(r.title LIKE ? ESCAPE '\\' OR r.excerpt LIKE ? ESCAPE '\\' OR r.tags LIKE ? ESCAPE '\\' OR r.ingredients LIKE ? ESCAPE '\\')`);
      args.push(like, like, like, like);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.min(Math.max(Number(q.get('limit')) || 9, 1), 50);
    const page = Math.max(Number(q.get('page')) || 1, 1);
    const sort = SORTS[q.get('sort')] ?? SORTS.recent;

    const total = db.prepare(`SELECT COUNT(*) AS n FROM recipes r ${whereSql}`).get(...args).n;
    const rows = db
      .prepare(`${SELECT_RECIPE} ${whereSql} ORDER BY ${sort} LIMIT ? OFFSET ?`)
      .all(...args, limit, (page - 1) * limit);
    return { items: rows.map((x) => shapeRecipe(x)), total, page, pages: Math.max(1, Math.ceil(total / limit)) };
  });

  r.get('/api/recipes/:slug', (ctx) => {
    const row = db.prepare(`${SELECT_RECIPE} WHERE r.slug = ?`).get(ctx.params.slug);
    if (!row || (!row.published && ctx.user?.role !== 'admin')) throw new HttpError(404, 'Ricetta non trovata');
    // Conta la visualizzazione una volta ogni 30 minuti per client.
    if (limiter.allow(`view:${ctx.clientId}:${row.id}`, 1, 30 * 60_000)) {
      db.prepare('UPDATE recipes SET views = views + 1 WHERE id = ?').run(row.id);
      row.views += 1;
    }
    const recipe = shapeRecipe(row, { full: true });
    const liked = !!db.prepare('SELECT 1 FROM likes WHERE recipe_id = ? AND client_id = ?').get(row.id, ctx.clientId);
    const mine = db.prepare('SELECT stars FROM ratings WHERE recipe_id = ? AND client_id = ?').get(row.id, ctx.clientId);
    const comments = db
      .prepare('SELECT id, author, body, created_at AS createdAt FROM comments WHERE recipe_id = ? AND approved = 1 ORDER BY created_at DESC, id DESC LIMIT 100')
      .all(row.id);
    const related = db
      .prepare(`${SELECT_RECIPE} WHERE r.published = 1 AND r.id != ? ORDER BY (r.category = ?) DESC, r.views DESC LIMIT 3`)
      .all(row.id, row.category)
      .map((x) => shapeRecipe(x));
    return { recipe, liked, myRating: mine?.stars ?? 0, comments, related };
  });

  /* ---------- ricette: interazioni ---------- */
  r.post('/api/recipes/:id/like', rateLimit('like', 60, 60_000), (ctx) => {
    const row = recipeOr404(ctx.params.id);
    const ins = db.prepare('INSERT OR IGNORE INTO likes (recipe_id, client_id) VALUES (?, ?)').run(row.id, ctx.clientId);
    let liked = true;
    if (ins.changes === 0) {
      db.prepare('DELETE FROM likes WHERE recipe_id = ? AND client_id = ?').run(row.id, ctx.clientId);
      liked = false;
    }
    const likes = db.prepare('SELECT COUNT(*) AS n FROM likes WHERE recipe_id = ?').get(row.id).n;
    events.broadcast('likes', { id: row.id, likes });
    return { liked, likes };
  });

  r.post('/api/recipes/:id/rate', rateLimit('rate', 30, 60_000), async (ctx) => {
    const row = recipeOr404(ctx.params.id);
    const { stars } = await readJson(ctx.req, config.maxJsonBytes);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new HttpError(400, 'Voto non valido (1-5)');
    db.prepare(
      `INSERT INTO ratings (recipe_id, client_id, stars) VALUES (?, ?, ?)
       ON CONFLICT(recipe_id, client_id) DO UPDATE SET stars = excluded.stars`,
    ).run(row.id, ctx.clientId, stars);
    const agg = db.prepare('SELECT ROUND(AVG(stars), 2) AS avg, COUNT(*) AS count FROM ratings WHERE recipe_id = ?').get(row.id);
    events.broadcast('rating', { id: row.id, avg: agg.avg, count: agg.count });
    return { myRating: stars, rating: agg };
  });

  r.post('/api/recipes/:id/comments', rateLimit('comment', 6, 60_000), async (ctx) => {
    const row = recipeOr404(ctx.params.id);
    const data = validateComment(await readJson(ctx.req, config.maxJsonBytes));
    const res = db.prepare('INSERT INTO comments (recipe_id, author, body) VALUES (?, ?, ?)').run(row.id, data.author, data.body);
    const comment = db
      .prepare('SELECT id, author, body, created_at AS createdAt FROM comments WHERE id = ?')
      .get(res.lastInsertRowid);
    events.broadcast('comment', { recipeId: row.id, comment });
    return reply(201, { comment });
  });

  /* ---------- newsletter ---------- */
  r.post('/api/newsletter', rateLimit('newsletter', 5, 10 * 60_000), async (ctx) => {
    const email = validateEmail((await readJson(ctx.req, config.maxJsonBytes)).email);
    const res = db.prepare('INSERT OR IGNORE INTO subscribers (email) VALUES (?)').run(email);
    return reply(res.changes ? 201 : 200, { ok: true, already: res.changes === 0 });
  });

  /* ---------- tempo reale ---------- */
  r.get('/api/events', (ctx) => {
    events.subscribe(ctx.req, ctx.res);
    return HANDLED;
  });

  /* ---------- admin: ricette ---------- */
  r.post('/api/recipes', requireAdmin, async (ctx) => {
    const d = validateRecipe(await readJson(ctx.req, config.maxJsonBytes));
    const slug = uniqueSlug(db, d.title);
    const res = db
      .prepare(
        `INSERT INTO recipes (slug, title, excerpt, category, difficulty, prep_minutes, cook_minutes, servings,
           image, emoji, ingredients, steps, tags, featured, published)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(slug, d.title, d.excerpt, d.category, d.difficulty, d.prep_minutes, d.cook_minutes, d.servings, d.image, d.emoji,
        JSON.stringify(d.ingredients), JSON.stringify(d.steps), JSON.stringify(d.tags), d.featured, d.published);
    const recipe = shapeRecipe(recipeOr404(res.lastInsertRowid), { full: true });
    if (recipe.published) events.broadcast('recipe', { id: recipe.id, slug: recipe.slug, title: recipe.title });
    return reply(201, { recipe });
  });

  r.get('/api/admin/recipes/:id', requireAdmin, (ctx) => ({ recipe: shapeRecipe(recipeOr404(ctx.params.id), { full: true }) }));

  r.put('/api/recipes/:id', requireAdmin, async (ctx) => {
    const row = recipeOr404(ctx.params.id);
    const d = validateRecipe(await readJson(ctx.req, config.maxJsonBytes));
    const slug = d.title === row.title ? row.slug : uniqueSlug(db, d.title, row.id);
    db.prepare(
      `UPDATE recipes SET slug=?, title=?, excerpt=?, category=?, difficulty=?, prep_minutes=?, cook_minutes=?, servings=?,
         image=?, emoji=?, ingredients=?, steps=?, tags=?, featured=?, published=?, updated_at=datetime('now') WHERE id=?`,
    ).run(slug, d.title, d.excerpt, d.category, d.difficulty, d.prep_minutes, d.cook_minutes, d.servings, d.image, d.emoji,
      JSON.stringify(d.ingredients), JSON.stringify(d.steps), JSON.stringify(d.tags), d.featured, d.published, row.id);
    return { recipe: shapeRecipe(recipeOr404(row.id), { full: true }) };
  });

  r.delete('/api/recipes/:id', requireAdmin, (ctx) => {
    const row = recipeOr404(ctx.params.id);
    db.prepare('DELETE FROM recipes WHERE id = ?').run(row.id);
    return { ok: true };
  });

  /* ---------- admin: upload, commenti, statistiche ---------- */
  r.post('/api/upload', requireAdmin, async (ctx) => {
    const buf = await readBody(ctx.req, config.maxUploadBytes);
    const ext = sniffImage(buf);
    if (!ext) throw new HttpError(415, 'Formato non supportato (PNG, JPG, WEBP o GIF)');
    const name = `${randomUUID()}${ext}`;
    await writeFile(resolve(config.uploadsDir, name), buf);
    return reply(201, { url: `/uploads/${name}` });
  });

  r.get('/api/admin/stats', requireAdmin, () => {
    const totals = db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM recipes) AS recipes,
                (SELECT COUNT(*) FROM recipes WHERE published = 0) AS drafts,
                (SELECT COALESCE(SUM(views),0) FROM recipes) AS views,
                (SELECT COUNT(*) FROM likes) AS likes,
                (SELECT COUNT(*) FROM comments) AS comments,
                (SELECT COUNT(*) FROM subscribers) AS subscribers`,
      )
      .get();
    const top = db.prepare('SELECT id, title, views FROM recipes ORDER BY views DESC LIMIT 6').all();
    const comments = db
      .prepare(
        `SELECT c.id, c.author, c.body, c.created_at AS createdAt, r.title AS recipe, r.slug
         FROM comments c JOIN recipes r ON r.id = c.recipe_id ORDER BY c.created_at DESC, c.id DESC LIMIT 20`,
      )
      .all();
    return { totals, top, comments };
  });

  r.delete('/api/comments/:id', requireAdmin, (ctx) => {
    const res = db.prepare('DELETE FROM comments WHERE id = ?').run(Number(ctx.params.id));
    if (!res.changes) throw new HttpError(404, 'Commento non trovato');
    return { ok: true };
  });

  r.get('/api/admin/subscribers', requireAdmin, () => ({
    items: db.prepare('SELECT email, created_at AS createdAt FROM subscribers ORDER BY id DESC LIMIT 500').all(),
  }));

  return r;
}

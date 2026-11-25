import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/* ---------- Password hashing (scrypt) ---------- */

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltB64, hashB64] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

/* ---------- Token firmati (HMAC-SHA256, stile JWT minimale) ---------- */

const b64u = (buf) => Buffer.from(buf).toString('base64url');

export function signToken(payload, secret, ttlSec) {
  const body = b64u(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec }));
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token, secret) {
  if (typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', secret).update(body).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.exp > Date.now() / 1000 ? payload : null;
  } catch {
    return null;
  }
}

/** Recupera (o genera e salva) il segreto di firma. */
export function loadSecret(config) {
  if (config.sessionSecret) return config.sessionSecret;
  const file = resolve(config.dataDir, '.secret');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  mkdirSync(config.dataDir, { recursive: true });
  const secret = randomBytes(48).toString('base64url');
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

/**
 * Crea l'utente admin al primo avvio. Se non è stata impostata una password
 * via ADMIN_PASSWORD ne viene generata una casuale, salvata in data/admin-credentials.txt.
 */
export function ensureAdmin(db, config) {
  const existing = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (existing) return null;
  const password = config.adminPassword || randomBytes(9).toString('base64url');
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(
    config.adminUser,
    hashPassword(password),
    'admin',
  );
  if (!config.adminPassword && config.dbFile !== ':memory:') {
    const file = resolve(config.dataDir, 'admin-credentials.txt');
    writeFileSync(file, `utente: ${config.adminUser}\npassword: ${password}\n`, { mode: 0o600 });
    return { user: config.adminUser, password, file };
  }
  return { user: config.adminUser, password: config.adminPassword ? '(da ADMIN_PASSWORD)' : password };
}

/* ---------- Rate limiting in memoria (finestra fissa) ---------- */

export class RateLimiter {
  #hits = new Map();
  constructor() {
    const t = setInterval(() => this.#sweep(), 60_000);
    t.unref();
  }
  /** true se la richiesta è consentita. */
  allow(key, max, windowMs) {
    const now = Date.now();
    const e = this.#hits.get(key);
    if (!e || e.reset <= now) {
      this.#hits.set(key, { count: 1, reset: now + windowMs });
      return true;
    }
    e.count += 1;
    return e.count <= max;
  }
  #sweep() {
    const now = Date.now();
    for (const [k, v] of this.#hits) if (v.reset <= now) this.#hits.delete(k);
  }
}

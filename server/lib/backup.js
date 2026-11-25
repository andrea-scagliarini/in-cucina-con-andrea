/** Backup consistenti del database SQLite con `VACUUM INTO` (sicuro anche a database in uso). */
import { mkdirSync, readdirSync, statSync, unlinkSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PREFIX = 'blog-';
// Nome con millisecondi (blog-AAAAMMGG-HHMMSSmmmZ.db): due backup ravvicinati non si sovrascrivono.
const stamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, '').replace(/\.(\d+)Z$/, '$1Z').replace('T', '-');
const NAME_RE = /^blog-\d{8}-\d{9}Z\.db$/;

export function listBackups(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => NAME_RE.test(f))
    .map((name) => {
      const st = statSync(resolve(dir, name));
      return { name, size: st.size, createdAt: st.mtime.toISOString() };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

/** Crea un backup e ruota quelli vecchi (ne conserva `keep`). Restituisce il file creato. */
export function createBackup(db, dir, keep = 14) {
  mkdirSync(dir, { recursive: true });
  let when = new Date();
  let name = `${PREFIX}${stamp(when)}.db`;
  while (existsSync(resolve(dir, name))) {
    when = new Date(when.getTime() + 1);
    name = `${PREFIX}${stamp(when)}.db`;
  }
  const file = resolve(dir, name);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const all = listBackups(dir);
  for (const old of all.slice(Math.max(1, keep))) unlinkSync(resolve(dir, old.name));
  return { name, size: statSync(file).size, createdAt: new Date().toISOString() };
}

/**
 * Pianifica i backup: uno all'avvio se l'ultimo è più vecchio dell'intervallo, poi uno a ogni intervallo.
 * Il timer non tiene vivo il processo.
 */
export function scheduleBackups(db, config, log = console.log) {
  if (!(config.backupEveryHours > 0) || config.dbFile === ':memory:') return () => {};
  const everyMs = config.backupEveryHours * 3_600_000;
  const run = () => {
    try {
      const b = createBackup(db, config.backupDir, config.backupKeep);
      if (!config.quiet) log(`💾  Backup creato: ${b.name} (${(b.size / 1024).toFixed(0)} KB)`);
    } catch (e) {
      console.error('Backup fallito:', e.message);
    }
  };
  const last = listBackups(config.backupDir)[0];
  if (!last || Date.now() - new Date(last.createdAt).getTime() > everyMs) run();
  const t = setInterval(run, everyMs);
  t.unref();
  return () => clearInterval(t);
}

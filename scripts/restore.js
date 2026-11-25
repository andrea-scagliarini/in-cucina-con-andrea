// Ripristina il database da un backup: `npm run restore -- blog-20261125-101500Z.db`
// Ferma il server prima! Il database attuale viene salvato come "blog.db.prima-del-ripristino-<data>".
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { resolve, isAbsolute, basename } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { loadConfig } from '../server/config.js';
import { listBackups } from '../server/lib/backup.js';

const config = loadConfig();
const arg = process.argv[2];

if (!arg) {
  const all = listBackups(config.backupDir);
  console.log(all.length ? 'Backup disponibili (usa: npm run restore -- <nome>):' : 'Nessun backup trovato in ' + config.backupDir);
  for (const b of all) console.log(`  ${b.name}  ${(b.size / 1024).toFixed(0)} KB  ${b.createdAt}`);
  process.exit(all.length ? 0 : 1);
}

const source = isAbsolute(arg) ? arg : resolve(config.backupDir, basename(arg));
if (!existsSync(source)) { console.error(`File non trovato: ${source}`); process.exit(1); }

// Verifica l'integrità del backup prima di sovrascrivere qualsiasi cosa.
const check = new DatabaseSync(source, { readOnly: true });
const result = check.prepare('PRAGMA integrity_check').get().integrity_check;
check.close();
if (result !== 'ok') { console.error(`Il backup è danneggiato (${result}). Ripristino annullato.`); process.exit(1); }

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
if (existsSync(config.dbFile)) {
  const safe = `${config.dbFile}.prima-del-ripristino-${stamp}`;
  copyFileSync(config.dbFile, safe);
  console.log(`Database attuale salvato in: ${safe}`);
}
for (const ext of ['-wal', '-shm']) rmSync(config.dbFile + ext, { force: true });
copyFileSync(source, config.dbFile);
console.log(`Ripristinato da: ${source}\nAvvia di nuovo il server.`);

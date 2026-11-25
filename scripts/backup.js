// Crea subito un backup del database: `npm run backup`
import { loadConfig } from '../server/config.js';
import { openDb } from '../server/db.js';
import { createBackup, listBackups } from '../server/lib/backup.js';

const config = loadConfig();
const db = openDb(config.dbFile);
try {
  const b = createBackup(db, config.backupDir, config.backupKeep);
  console.log(`Backup creato: ${config.backupDir}\\${b.name} (${(b.size / 1024).toFixed(0)} KB)`);
  console.log(`Backup conservati: ${listBackups(config.backupDir).length} (massimo ${config.backupKeep})`);
} finally {
  db.close();
}

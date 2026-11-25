import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { seedIfEmpty } from './seed.js';
import { ensureAdmin } from './lib/auth.js';
import { createApp } from './app.js';
import { scheduleBackups } from './lib/backup.js';

/** Costruisce il server (usato sia da `npm start` sia dai test). */
export function buildServer(overrides = {}) {
  const config = loadConfig(overrides);
  const db = openDb(config.dbFile);
  if (config.seed) seedIfEmpty(db);
  const admin = ensureAdmin(db, config);
  const app = createApp({ db, config });
  const stopBackups = scheduleBackups(db, config);
  const server = createServer(app.handler);
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  const close = () =>
    new Promise((res) => {
      app.close();
      stopBackups();
      server.close(() => {
        db.close();
        res();
      });
      server.closeAllConnections?.();
    });
  return { server, db, config, admin, close };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { server, config, admin, close } = buildServer();
  server.listen(config.port, config.host, () => {
    console.log(`\n🍝  ${config.siteName} in ascolto su http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
    if (admin) {
      console.log('\n🔐  Utente admin creato al primo avvio:');
      console.log(`    utente:   ${admin.user}`);
      console.log(`    password: ${admin.password}`);
      if (admin.file) console.log(`    (salvata anche in ${admin.file})`);
    }
    console.log('\n    Pannello admin: /admin\n');
  });
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
      console.log('\nChiusura in corso…');
      await close();
      process.exit(0);
    });
  }
}

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Configurazione letta da variabili d'ambiente, con default sensati per lo sviluppo. */
export function loadConfig(overrides = {}) {
  const env = process.env;
  const dataDir = resolve(overrides.dataDir ?? env.DATA_DIR ?? resolve(root, 'data'));
  return {
    root,
    port: Number(overrides.port ?? env.PORT ?? 3000),
    host: overrides.host ?? env.HOST ?? '127.0.0.1',
    dataDir,
    dbFile: overrides.dbFile ?? resolve(dataDir, 'blog.db'),
    uploadsDir: resolve(dataDir, 'uploads'),
    publicDir: resolve(root, 'public'),
    siteUrl: (overrides.siteUrl ?? env.SITE_URL ?? '').replace(/\/$/, ''),
    siteName: 'In cucina con Andrea',
    adminUser: overrides.adminUser ?? env.ADMIN_USER ?? 'admin',
    adminPassword: overrides.adminPassword ?? env.ADMIN_PASSWORD ?? '',
    sessionSecret: overrides.sessionSecret ?? env.SESSION_SECRET ?? '',
    tokenTtlSec: 60 * 60 * 12,
    maxUploadBytes: 5 * 1024 * 1024,
    maxJsonBytes: 256 * 1024,
    seed: overrides.seed ?? true,
    quiet: overrides.quiet ?? false,
  };
}

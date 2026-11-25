/**
 * Pipeline immagini.
 *
 *  - Con `sharp` installato (dipendenza opzionale): auto-rotazione, rimozione dei metadati (EXIF/GPS),
 *    conversione in WebP e tre larghezze (480/960/1600) per `srcset`.
 *  - Senza `sharp`: l'immagine viene comunque salvata in locale così com'è (dopo il controllo dei magic bytes).
 *
 * Include anche lo scaricamento sicuro di immagini remote (protezione SSRF) per ospitarle in locale.
 */
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { sniffImage } from '../validate.js';

export const WIDTHS = [480, 960, 1600];
export const DEFAULT_WIDTH = 960;

let sharpPromise;
/** Carica sharp solo se disponibile; restituisce null altrimenti. */
export function loadSharp() {
  sharpPromise ??= import('sharp').then((m) => m.default ?? m).catch(() => null);
  return sharpPromise;
}

/** Salva un'immagine (Buffer) in uploadsDir e restituisce l'URL pubblico da memorizzare. */
export async function saveImage(buf, uploadsDir) {
  const ext = sniffImage(buf);
  if (!ext) return null;
  const id = randomUUID();
  const sharp = await loadSharp();

  if (sharp) {
    const base = sharp(buf, { limitInputPixels: 40_000_000, failOn: 'error' }).rotate();
    await Promise.all(
      WIDTHS.map(async (w) => {
        const out = await base.clone().resize({ width: w, withoutEnlargement: true }).webp({ quality: 78, effort: 4 }).toBuffer();
        await writeFile(resolve(uploadsDir, `${id}-${w}.webp`), out);
      }),
    );
    return { url: `/uploads/${id}-${DEFAULT_WIDTH}.webp`, optimized: true };
  }

  await writeFile(resolve(uploadsDir, `${id}${ext}`), buf);
  return { url: `/uploads/${id}${ext}`, optimized: false };
}

/* ---------- download remoto sicuro (anti-SSRF) ---------- */

const blocked = new BlockList();
for (const [net, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]])
  blocked.addSubnet(net, bits, 'ipv4');
for (const [net, bits] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) blocked.addSubnet(net, bits, 'ipv6');

export function isPublicAddress(ip) {
  const fam = isIP(ip);
  if (!fam) return false;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip); // IPv4 mappato in IPv6
  if (mapped) return !blocked.check(mapped[1], 'ipv4');
  return !blocked.check(ip, fam === 4 ? 'ipv4' : 'ipv6');
}

function fetchOnce(url, address, family, { maxBytes, timeoutMs }) {
  return new Promise((resolveP, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.get(
      url,
      {
        headers: { 'User-Agent': 'BlogCucinaImageFetcher/1.0', Accept: 'image/*' },
        timeout: timeoutMs,
        // Collega la connessione all'indirizzo già validato (evita il DNS rebinding).
        // Node ≥ 20 può chiedere una lista ({ all: true }) per l'autoselezione della famiglia IP.
        lookup: (_host, opts, cb) => (opts?.all ? cb(null, [{ address, family }]) : cb(null, address, family)),
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolveP({ redirect: new URL(res.headers.location, url).href });
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
        if (Number(res.headers['content-length']) > maxBytes) { res.destroy(); return reject(new Error('Immagine troppo grande')); }
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
          size += c.length;
          if (size > maxBytes) { res.destroy(); reject(new Error('Immagine troppo grande')); } else chunks.push(c);
        });
        res.on('end', () => resolveP({ buffer: Buffer.concat(chunks) }));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('Timeout')));
    req.on('error', reject);
  });
}

/** Scarica un'immagine remota (solo http/https su porte standard, solo indirizzi pubblici). */
export async function fetchRemoteImage(rawUrl, { maxBytes = 8 * 1024 * 1024, timeoutMs = 8000, maxRedirects = 3 } = {}) {
  let current = rawUrl;
  for (let i = 0; i <= maxRedirects; i++) {
    const url = new URL(current);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Protocollo non consentito');
    if (url.username || url.password) throw new Error('URL con credenziali non consentito');
    if (url.port && !['80', '443'].includes(url.port)) throw new Error('Porta non consentita');
    const addrs = isIP(url.hostname) ? [{ address: url.hostname, family: isIP(url.hostname) }] : await lookup(url.hostname, { all: true });
    if (!addrs.length || !addrs.every((a) => isPublicAddress(a.address))) throw new Error('Indirizzo non consentito');
    const r = await fetchOnce(url, addrs[0].address, addrs[0].family, { maxBytes, timeoutMs });
    if (r.redirect) { current = r.redirect; continue; }
    return r.buffer;
  }
  throw new Error('Troppi reindirizzamenti');
}

/** Ospita in locale un'immagine remota. Restituisce il nuovo URL oppure null se non riesce. */
export async function localizeImage(url, uploadsDir) {
  try {
    const buf = await fetchRemoteImage(url);
    const saved = await saveImage(buf, uploadsDir);
    return saved?.url ?? null;
  } catch {
    return null;
  }
}

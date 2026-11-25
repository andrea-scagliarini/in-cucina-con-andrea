import { gzipSync } from 'node:zlib';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

const COMPRESSIBLE = /^(text\/|application\/(json|xml|manifest)|image\/svg)/;

/** Invia un body (stringa o Buffer), comprimendolo con gzip quando conviene. */
export function send(req, res, status, body, headers = {}) {
  const type = headers['Content-Type'] ?? '';
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(body ?? '');
  const h = { ...headers };
  if (buf.length > 1024 && COMPRESSIBLE.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
    buf = gzipSync(buf);
    h['Content-Encoding'] = 'gzip';
    h.Vary = 'Accept-Encoding';
  }
  h['Content-Length'] = buf.length;
  res.writeHead(status, h);
  res.end(req.method === 'HEAD' ? undefined : buf);
}

export function sendJson(req, res, status, data, headers = {}) {
  send(req, res, status, JSON.stringify(data), {
    'Content-Type': MIME['.json'],
    'Cache-Control': 'no-store',
    ...headers,
  });
}

/** Legge il body della richiesta con un limite di dimensione. */
export async function readBody(req, limit) {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > limit) throw new HttpError(413, 'Payload troppo grande');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Payload troppo grande');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req, limit) {
  const buf = await readBody(req, limit);
  if (!buf.length) return {};
  try {
    const data = JSON.parse(buf.toString('utf8'));
    if (data === null || typeof data !== 'object') throw new Error('not object');
    return data;
  } catch {
    throw new HttpError(400, 'JSON non valido');
  }
}

export const escXml = (s) =>
  String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

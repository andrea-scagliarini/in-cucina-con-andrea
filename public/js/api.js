import { clientId, session } from './store.js';

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function request(method, path, { body, raw, signal } = {}) {
  const headers = { 'X-Client-Id': clientId() };
  const token = session.token();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(path, { method, headers, signal, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0, 'Connessione non disponibile. Riprova.');
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) session.clear();
    throw new ApiError(res.status, data?.error ?? `Errore ${res.status}`);
  }
  return data;
}

const qs = (o) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => v !== '' && v != null && p.set(k, v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  meta: () => request('GET', '/api/meta'),
  recipes: (params = {}, signal) => request('GET', `/api/recipes${qs(params)}`, { signal }),
  recipe: (slug) => request('GET', `/api/recipes/${encodeURIComponent(slug)}`),
  like: (id) => request('POST', `/api/recipes/${id}/like`),
  rate: (id, stars) => request('POST', `/api/recipes/${id}/rate`, { body: { stars } }),
  comment: (id, body) => request('POST', `/api/recipes/${id}/comments`, { body }),
  subscribe: (email) => request('POST', '/api/newsletter', { body: { email } }),
  login: (username, password) => request('POST', '/api/auth/login', { body: { username, password } }),
  me: () => request('GET', '/api/auth/me'),
  stats: () => request('GET', '/api/admin/stats'),
  adminRecipe: (id) => request('GET', `/api/admin/recipes/${id}`),
  createRecipe: (data) => request('POST', '/api/recipes', { body: data }),
  updateRecipe: (id, data) => request('PUT', `/api/recipes/${id}`, { body: data }),
  deleteRecipe: (id) => request('DELETE', `/api/recipes/${id}`),
  deleteComment: (id) => request('DELETE', `/api/comments/${id}`),
  subscribers: () => request('GET', '/api/admin/subscribers'),
  upload: (file) => request('POST', '/api/upload', { raw: file }),
};

/* Eventi in tempo reale (SSE) con riconnessione automatica del browser. */
const handlers = new Map();
let source = null;
export function live(type, fn) {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type).add(fn);
  if (!source && 'EventSource' in window) {
    source = new EventSource('/api/events');
    for (const t of ['likes', 'rating', 'comment', 'recipe']) {
      source.addEventListener(t, (e) => {
        let data;
        try { data = JSON.parse(e.data); } catch { return; }
        handlers.get(t)?.forEach((h) => h(data));
      });
    }
  }
  return () => handlers.get(type)?.delete(fn);
}

/* Stato lato client persistito in localStorage (con fallback in memoria se non disponibile). */
const mem = new Map();
const read = (k, d) => {
  try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return mem.has(k) ? mem.get(k) : d; }
};
const write = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { mem.set(k, v); }
};

const listeners = new Set();
const emit = (key) => listeners.forEach((fn) => fn(key));
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));

/* Identificativo anonimo del visitatore (per like e voti). */
export function clientId() {
  let id = read('cid', null);
  if (!id) {
    id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}-xxxxxxxx`).replace(/[^a-zA-Z0-9-]/g, '');
    write('cid', id);
  }
  return id;
}

/* Preferiti */
export const favorites = {
  all: () => read('favs', []),
  has: (id) => favorites.all().includes(id),
  toggle(id) {
    const list = favorites.all();
    const i = list.indexOf(id);
    i >= 0 ? list.splice(i, 1) : list.push(id);
    write('favs', list);
    emit('favs');
    return i < 0;
  },
};

/* Ingredienti spuntati per ricetta */
export const checked = {
  get: (id) => read(`chk:${id}`, []),
  set: (id, list) => write(`chk:${id}`, list),
};

/* Preferenze */
export const prefs = {
  get: (k, d) => read(`pref:${k}`, d),
  set: (k, v) => { write(`pref:${k}`, v); emit(k); },
};

/* Sessione admin */
export const session = {
  token: () => read('token', null),
  set: (t) => { write('token', t); emit('session'); },
  clear: () => { try { localStorage.removeItem('token'); } catch { mem.delete('token'); } emit('session'); },
};

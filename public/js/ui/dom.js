/* Template HTML con escape automatico: i valori interpolati sono sempre escapati,
   a meno che non siano a loro volta risultati di html`` o raw(). */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);
const render = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(render).join('') : v == null || v === false ? '' : esc(v));
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += render(v) + strings[i + 1]; });
  return new Raw(out);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const on = (root, type, sel, fn) =>
  root.addEventListener(type, (e) => {
    const t = e.target.closest?.(sel);
    if (t && root.contains(t)) fn(e, t);
  });

export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function fmtMinutes(m) {
  if (!m) return '—';
  const h = Math.floor(m / 60), r = m % 60;
  return h ? (r ? `${h} h ${r} min` : `${h} h`) : `${m} min`;
}

const FR = [[0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾']];
export function fmtAmount(n) {
  if (n == null) return '';
  const rounded = n >= 100 ? Math.round(n / 5) * 5 : n >= 10 ? Math.round(n) : Math.round(n * 100) / 100;
  const whole = Math.floor(rounded), frac = rounded - whole;
  if (frac < 0.04) return String(whole || rounded);
  const f = FR.find(([v]) => Math.abs(v - frac) < 0.05);
  if (f) return `${whole || ''}${f[1]}`;
  return String(Math.round(rounded * 10) / 10).replace('.', ',');
}

export function fmtDate(s) {
  const d = new Date(`${String(s).replace(' ', 'T')}Z`);
  return Number.isNaN(+d) ? '' : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function fmtDuration(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Immagine ricetta con fallback a gradiente + emoji se manca o non carica. */
export function media(r, { eager = false } = {}) {
  if (!r.image) return html`<div class="ph" role="img" aria-label="${r.title}">${r.emoji}</div>`;
  return html`<img src="${r.image}" alt="${r.title}" loading="${eager ? 'eager' : 'lazy'}" decoding="async" data-fallback="${r.emoji}" referrerpolicy="no-referrer">`;
}

/** Sostituisce le immagini rotte con il placeholder (le immagini esterne possono sparire). */
export function armImageFallbacks(root) {
  $$('img[data-fallback]', root).forEach((img) => {
    const swap = () => {
      const ph = document.createElement('div');
      ph.className = 'ph';
      ph.setAttribute('role', 'img');
      ph.setAttribute('aria-label', img.alt);
      ph.textContent = img.dataset.fallback;
      img.replaceWith(ph);
    };
    if (img.complete && img.naturalWidth === 0 && img.currentSrc) swap();
    else img.addEventListener('error', swap, { once: true });
  });
}

export function animateNumber(el, to, ms = 1400) {
  if (reducedMotion()) { el.textContent = to.toLocaleString('it-IT'); return; }
  const t0 = performance.now();
  const tick = (t) => {
    const p = Math.min(1, (t - t0) / ms);
    el.textContent = Math.round(to * (1 - Math.pow(1 - p, 4))).toLocaleString('it-IT');
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

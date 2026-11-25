/* Router SPA basato su History API, con View Transitions, ripristino dello scroll e cleanup delle viste. */
import { $, $$, reducedMotion } from './ui/dom.js';
import { scanReveal } from './fx/interactions.js';
import { sound } from './audio/engine.js';

const routes = [];
let cleanup = null, token = 0, onChange = () => {};
const scrollMem = new Map();
history.scrollRestoration = 'manual';

export function route(pattern, view) {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/:([a-z]+)/gi, (_, k) => (keys.push(k), '([^/]+)'))}/?$`);
  routes.push({ re, keys, view });
}
export function onNavigate(fn) { onChange = fn; }

function resolve(pathname) {
  for (const r of routes) {
    const m = r.re.exec(pathname);
    if (m) return { view: r.view, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

export function navigate(to, { replace = false } = {}) {
  const url = new URL(to, location.origin);
  if (url.origin !== location.origin) { location.href = to; return; }
  scrollMem.set(history.state?.k, scrollY);
  const k = Math.random().toString(36).slice(2);
  history[replace ? 'replaceState' : 'pushState']({ k }, '', url.pathname + url.search);
  return render(false);
}

export function refresh() { return render(true); }

async function render(keepScroll, restoreY) {
  const my = ++token;
  const app = $('#app');
  const { pathname, searchParams } = new URL(location.href);
  const hit = resolve(pathname) ?? resolve('/404');
  let result;
  try {
    result = await hit.view({ params: hit.params, query: searchParams, path: pathname });
  } catch (e) {
    console.error(e);
    result = { title: 'Errore', html: { s: `<div class="empty"><big>🔥</big><h2>Ops, qualcosa si è bruciato</h2><p>${String(e.message ?? e).replace(/[<>&]/g, '')}</p><a class="btn" href="/" data-link>Torna alla home</a></div>` } };
  }
  if (my !== token) return; // navigazione superata da una più recente

  const apply = () => {
    cleanup?.();
    cleanup = result.cleanup?.bind(result) ?? null;
    app.innerHTML = result.html.s;
    app.classList.toggle('wide', !!result.wide);
    document.title = result.title ? `${result.title} · In cucina con Andrea` : 'In cucina con Andrea';
    result.after?.(app);
    scanReveal(app);
    scrollTo(0, keepScroll ? scrollY : restoreY ?? 0);
    onChange(pathname);
    app.focus({ preventScroll: true });
  };

  const prev = $('#app').children.length > 0;
  if (document.startViewTransition && !reducedMotion() && prev) {
    sound.play('whoosh');
    await document.startViewTransition(apply).updateCallbackDone.catch(() => {});
  } else apply();
}

export function startRouter() {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest?.('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download') || a.origin !== location.origin) return;
    if (!a.hasAttribute('data-link') && /\.[a-z0-9]+$/i.test(a.pathname)) return; // file statici (feed.xml, ecc.)
    e.preventDefault();
    if (a.pathname + a.search === location.pathname + location.search) { scrollTo({ top: 0, behavior: 'smooth' }); return; }
    sound.play('click');
    navigate(a.href);
  });
  addEventListener('popstate', () => render(false, scrollMem.get(history.state?.k) ?? 0));
  if (!history.state) history.replaceState({ k: 'init' }, '');
  return render(false);
}

export function setActiveNav(path) {
  $$('[data-nav]').forEach((a) => {
    const t = a.dataset.nav;
    const active = t === '/' ? path === '/' || path.startsWith('/ricette') : path.startsWith(t);
    a.classList.toggle('active', active);
    active ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  });
}

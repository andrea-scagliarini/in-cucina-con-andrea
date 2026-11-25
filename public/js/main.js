import { route, startRouter, onNavigate, setActiveNav, navigate } from './router.js';
import { homeView } from './views/home.js';
import { recipeView } from './views/recipe.js';
import { favoritesView, aboutView, privacyView, notFoundView } from './views/pages.js';
import { adminView, editorView } from './views/admin.js';
import { sound } from './audio/engine.js';
import { fx } from './fx/engine.js';
import { initTilt, initMagnetic, initScroll } from './fx/interactions.js';
import { favorites, prefs, subscribe } from './store.js';
import { toast } from './ui/toast.js';
import { $, reducedMotion } from './ui/dom.js';

/* ---------- rotte ---------- */
route('/', homeView);
route('/ricette/:slug', recipeView);
route('/preferiti', favoritesView);
route('/chi-sono', aboutView);
route('/privacy', privacyView);
route('/admin/nuova', editorView);
route('/admin/modifica/:id', editorView);
route('/admin', adminView);
route('/404', notFoundView);

/* ---------- tema (con transizione circolare) ---------- */
const root = document.documentElement;
async function setTheme(dark, x = innerWidth - 60, y = 30) {
  const apply = () => {
    root.dataset.theme = dark ? 'dark' : 'light';
    $('meta[name="theme-color"]')?.setAttribute('content', dark ? '#150f0b' : '#fbf3e4');
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch { /* ignorato */ }
  };
  if (!document.startViewTransition || reducedMotion()) return apply();
  root.classList.add('theme-vt');
  const t = document.startViewTransition(apply);
  try {
    await t.ready;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.animate({ clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 650, easing: 'cubic-bezier(.65,0,.35,1)', pseudoElement: '::view-transition-new(root)' });
    await t.finished;
  } catch { /* transizione saltata */ }
  root.classList.remove('theme-vt');
}
const toggleTheme = (e) => {
  const b = $('#btn-theme').getBoundingClientRect();
  setTheme(root.dataset.theme !== 'dark', e?.clientX || b.left + b.width / 2, e?.clientY || b.top + b.height / 2);
  sound.play('click');
};
$('#btn-theme').addEventListener('click', toggleTheme);

/* ---------- suoni ---------- */
const soundBtn = $('#btn-sound');
const paintSound = () => {
  soundBtn.setAttribute('aria-pressed', sound.enabled);
  soundBtn.setAttribute('aria-label', sound.enabled ? 'Disattiva i suoni' : 'Attiva i suoni');
  soundBtn.classList.toggle('hint', !sound.enabled && !prefs.get('soundAsked', false));
};
async function toggleSound() {
  await sound.setEnabled(!sound.enabled);
  prefs.set('soundAsked', true);
  paintSound();
  if (sound.enabled) toast('Suoni attivi · premi A per l\'atmosfera da cucina 🍳');
}
soundBtn.addEventListener('click', toggleSound);
async function toggleAmbient() {
  if (!sound.enabled) await sound.setEnabled(true);
  sound.ambient(!sound.ambientOn);
  paintSound();
  toast(sound.ambientOn ? 'Atmosfera: cucina in piena attività 🔥' : 'Atmosfera disattivata');
}
// Se l'utente aveva già attivato i suoni, riprende al primo gesto (policy autoplay del browser).
if (prefs.get('sound', false)) {
  sound.enabled = true;
  const wake = async () => { await sound.resume(); if (prefs.get('ambient', false)) sound.ambient(true); paintSound(); };
  addEventListener('pointerdown', wake, { once: true });
  addEventListener('keydown', wake, { once: true });
}
paintSound();

// suoni di hover su elementi interattivi (delegati)
document.addEventListener('pointerover', (e) => {
  const t = e.target.closest?.('.btn, .chip, .icon-btn, .nav a, .brand');
  if (t && !t.contains(e.relatedTarget)) sound.play('hover');
});
document.addEventListener('click', (e) => { if (e.target.closest?.('.chip, .icon-btn:not(#btn-sound):not(#btn-theme)')) sound.play('click'); });

/* ---------- menu mobile ---------- */
const menuBtn = $('#btn-menu'), nav = $('#nav');
const setMenu = (open) => { nav.classList.toggle('open', open); menuBtn.setAttribute('aria-expanded', open); };
menuBtn.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
nav.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });

/* ---------- badge preferiti, anno, torna su ---------- */
const favBadge = $('#fav-count');
const paintFavs = () => { const n = favorites.all().length; favBadge.textContent = n; favBadge.hidden = !n; };
subscribe((k) => k === 'favs' && paintFavs());
paintFavs();
$('#year').textContent = new Date().getFullYear();
$('#btn-top').addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));

/* ---------- scorciatoie da tastiera ---------- */
addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if (typing) { if (e.key === 'Escape') e.target.blur(); return; }
  if (e.key === '/') {
    e.preventDefault();
    const q = $('#q');
    if (q) { q.focus(); q.select(); } else navigate('/').then(() => $('#q')?.focus());
  } else if (e.key === 't' || e.key === 'T') toggleTheme();
  else if (e.key === 'm' || e.key === 'M') toggleSound();
  else if (e.key === 'a' || e.key === 'A') toggleAmbient();
});

/* ---------- avvio ---------- */
fx.init();
initTilt();
initMagnetic();
initScroll();
onNavigate((path) => { setActiveNav(path); setMenu(false); });
startRouter();

/* ---------- PWA: service worker (solo su origini sicure) ---------- */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

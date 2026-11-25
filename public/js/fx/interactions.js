/* Micro-interazioni riutilizzabili: tilt 3D, scroll reveal, parallax, magnetic buttons, barra di avanzamento. */
import { $$, reducedMotion } from '../ui/dom.js';

/* ---------- Scroll reveal ---------- */
let io;
export function scanReveal(root = document) {
  const items = $$('[data-reveal]:not(.in)', root);
  if (reducedMotion() || !('IntersectionObserver' in window)) { items.forEach((el) => el.classList.add('in')); return; }
  io ??= new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  items.forEach((el) => io.observe(el));
}

/* ---------- Tilt 3D + riflesso sulle card (event delegation) ---------- */
export function initTilt() {
  if (reducedMotion() || !matchMedia('(hover: hover)').matches) return;
  let current = null, raf = 0;
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest?.('.card');
    if (current && current !== card) reset(current);
    current = card;
    if (!card || raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      card.classList.add('tilting');
      card.style.setProperty('--ry', `${(px - 0.5) * 12}deg`);
      card.style.setProperty('--rx', `${(0.5 - py) * 10}deg`);
      card.style.setProperty('--mx', `${px * 100}%`);
      card.style.setProperty('--my', `${py * 100}%`);
    });
  }, { passive: true });
  document.addEventListener('pointerleave', () => current && reset(current), true);
  function reset(c) { c.classList.remove('tilting'); c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg'); }
}

/* ---------- Pulsanti magnetici ---------- */
export function initMagnetic() {
  if (reducedMotion() || !matchMedia('(hover: hover)').matches) return;
  document.addEventListener('pointermove', (e) => {
    const b = e.target.closest?.('.btn:not(.btn--small)');
    if (!b) return;
    const r = b.getBoundingClientRect();
    b.style.translate = `${(e.clientX - r.left - r.width / 2) * 0.12}px ${(e.clientY - r.top - r.height / 2) * 0.25}px`;
  }, { passive: true });
  document.addEventListener('pointerout', (e) => { const b = e.target.closest?.('.btn'); if (b) b.style.translate = ''; });
}

/* ---------- Scroll: barra di avanzamento, header intelligente, parallax ---------- */
export function initScroll() {
  const bar = document.getElementById('progress'), header = document.getElementById('header');
  let lastY = scrollY, ticking = false;
  const update = () => {
    ticking = false;
    const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
    header.classList.toggle('scrolled', y > 8);
    header.classList.toggle('hide', y > lastY && y > 240 && !document.getElementById('nav').classList.contains('open'));
    lastY = y;
    if (!reducedMotion()) {
      for (const el of document.querySelectorAll('[data-parallax]')) {
        const k = Number(el.dataset.parallax) || 0.2;
        el.style.transform = `translate3d(0, ${y * k}px, 0)`;
      }
      const blobs = document.querySelectorAll('.hero__blob');
      blobs.forEach((b, i) => { b.style.translate = `0 ${y * (0.1 + i * 0.05)}px`; });
    }
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  update();
}

/* ---------- Parallax dei blob sul mouse (hero) ---------- */
export function initHeroMouse(root) {
  if (reducedMotion()) return () => {};
  const emojis = $$('.hero__emoji', root);
  const onMove = (e) => {
    const x = e.clientX / innerWidth - 0.5, y = e.clientY / innerHeight - 0.5;
    emojis.forEach((el, i) => { const k = (i % 3 + 1) * 14; el.style.translate = `${-x * k}px ${-y * k}px`; });
  };
  addEventListener('pointermove', onMove, { passive: true });
  return () => removeEventListener('pointermove', onMove);
}

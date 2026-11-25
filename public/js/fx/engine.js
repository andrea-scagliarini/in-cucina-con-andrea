/* Motore di effetti su canvas: particelle ambientali (braci/farina), scintille del mouse,
   coriandoli a tema cucina e cursore personalizzato. Un solo loop rAF, in pausa se la tab è nascosta. */
import { reducedMotion } from '../ui/dom.js';

const EMOJI = ['🍅', '🌿', '🧄', '🍋', '🧀', '🌶️', '🧀', '🥖', '🍝', '✨'];
const rand = (a, b) => a + Math.random() * (b - a);

class FxEngine {
  canvas = document.getElementById('fx');
  ctx = this.canvas.getContext('2d');
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  w = 0; h = 0;
  ambient = []; sparks = []; confetti = [];
  mouse = { x: -999, y: -999, px: -999, py: -999, active: false };
  running = false; last = 0;
  reduced = reducedMotion();
  cursor = { x: 0, y: 0, rx: 0, ry: 0, el: document.getElementById('cursor') };

  init() {
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('pointermove', (e) => this.#move(e), { passive: true });
    addEventListener('pointerdown', () => this.cursor.el.classList.add('down'));
    addEventListener('pointerup', () => this.cursor.el.classList.remove('down'));
    document.addEventListener('pointerover', (e) => {
      const hot = e.target.closest?.('a, button, [role="button"], input, select, textarea, label, .card, .ingredients li');
      this.cursor.el.classList.toggle('hover', !!hot);
    });
    document.addEventListener('visibilitychange', () => (document.hidden ? this.stop() : this.start()));
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', (e) => { this.reduced = e.matches; this.#seed(); });
    if (matchMedia('(hover: hover) and (pointer: fine)').matches && !this.reduced) this.cursor.el.classList.add('on');
    this.#seed();
    this.start();
  }

  resize() {
    this.w = innerWidth; this.h = innerHeight;
    this.canvas.width = this.w * this.dpr; this.canvas.height = this.h * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.#seed();
  }

  #isDark() { return document.documentElement.dataset.theme === 'dark'; }

  #seed() {
    const n = this.reduced ? 0 : Math.min(70, Math.floor((this.w * this.h) / 24000));
    this.ambient = Array.from({ length: n }, () => this.#particle(true));
  }

  #particle(anywhere) {
    return {
      x: rand(0, this.w), y: anywhere ? rand(0, this.h) : this.h + 10,
      r: rand(0.8, 3.2), vy: rand(0.15, 0.7), vx: rand(-0.15, 0.15), ph: rand(0, 6.28), sway: rand(0.2, 0.9), a: rand(0.25, 0.8),
    };
  }

  setTheme() { /* i colori vengono letti a ogni frame; qui per eventuali estensioni */ }

  #move(e) {
    const m = this.mouse;
    m.x = e.clientX; m.y = e.clientY; m.active = true;
    this.cursor.el.classList.add('live');
    if (!this.cursor.seen) { this.cursor.seen = true; this.cursor.rx = e.clientX; this.cursor.ry = e.clientY; }
    this.cursor.x = e.clientX; this.cursor.y = e.clientY;
    if (this.reduced) return;
    const dx = m.x - m.px, dy = m.y - m.py;
    if (Math.hypot(dx, dy) > 14 && e.pointerType !== 'touch') {
      this.sparks.push({ x: m.x, y: m.y, vx: rand(-0.6, 0.6), vy: rand(-1.2, -0.2), life: 1, r: rand(1.5, 3.5) });
      if (this.sparks.length > 80) this.sparks.shift();
      m.px = m.x; m.py = m.y;
    }
  }

  /** Esplosione di coriandoli a tema cucina da un punto (x, y in px viewport). */
  burst(x, y, { count = 26, emoji = true } = {}) {
    if (this.reduced) return;
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), s = rand(3, 11);
      this.confetti.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 4, g: 0.28, rot: rand(0, 6.28), vr: rand(-0.3, 0.3), life: 1,
        size: rand(16, 30), glyph: emoji ? EMOJI[(Math.random() * EMOJI.length) | 0] : null, hue: rand(10, 50),
      });
    }
    this.start();
  }

  burstFrom(el, opts) {
    if (!el?.getBoundingClientRect) { this.burst(innerWidth / 2, innerHeight / 2, opts); return; }
    const r = el.getBoundingClientRect();
    this.burst(r.left + r.width / 2, r.top + r.height / 2, opts);
  }

  start() { if (!this.running) { this.running = true; this.last = performance.now(); requestAnimationFrame((t) => this.#frame(t)); } }
  stop() { this.running = false; }

  #frame(t) {
    if (!this.running) return;
    const dt = Math.min(2.5, (t - this.last) / 16.67); this.last = t;
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    const dark = this.#isDark();

    // cursore: punto immediato, anello con inerzia
    const c = this.cursor;
    if (c.el.classList.contains('on')) {
      c.rx += (c.x - c.rx) * 0.18 * dt; c.ry += (c.y - c.ry) * 0.18 * dt;
      c.el.firstElementChild.style.transform = `translate(${c.x}px, ${c.y}px)`;
      c.el.lastElementChild.style.transform = `translate(${c.rx}px, ${c.ry}px)`;
    }

    // particelle ambientali: braci in dark mode, pulviscolo di farina in light
    for (const p of this.ambient) {
      p.y -= p.vy * dt; p.ph += 0.01 * dt;
      p.x += (p.vx + Math.sin(p.ph) * p.sway * 0.4) * dt;
      if (this.mouse.active) { // repulsione leggera dal mouse
        const dx = p.x - this.mouse.x, dy = p.y - this.mouse.y, d2 = dx * dx + dy * dy;
        if (d2 < 14000) { const f = (1 - d2 / 14000) * 2.2; p.x += (dx / Math.sqrt(d2 + 1)) * f * dt; p.y += (dy / Math.sqrt(d2 + 1)) * f * dt; }
      }
      if (p.y < -10) Object.assign(p, this.#particle(false));
      const flick = dark ? 0.6 + Math.sin(p.ph * 6) * 0.4 : 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283);
      ctx.fillStyle = dark ? `rgba(255, ${140 + p.r * 25 | 0}, 60, ${p.a * flick * 0.8})` : `rgba(190, 120, 50, ${p.a * 0.28})`;
      if (dark) { ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(255,120,40,.9)'; } else ctx.shadowBlur = 0;
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // scintille del mouse
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= 0.035 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.life <= 0) { this.sparks.splice(i, 1); continue; }
      ctx.globalAlpha = s.life; ctx.fillStyle = dark ? '#ffb347' : '#e0602a';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * s.life, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // coriandoli
    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const p = this.confetti[i];
      p.vy += p.g * dt; p.vx *= 0.99; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.life -= 0.009 * dt;
      if (p.life <= 0 || p.y > h + 40) { this.confetti.splice(i, 1); continue; }
      ctx.save(); ctx.globalAlpha = Math.min(1, p.life * 2); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      if (p.glyph) { ctx.font = `${p.size}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.glyph, 0, 0); }
      else { ctx.fillStyle = `hsl(${p.hue} 90% 55%)`; ctx.fillRect(-4, -2, 8, 4); }
      ctx.restore();
    }

    const idle = !this.ambient.length && !this.sparks.length && !this.confetti.length && !c.el.classList.contains('on');
    if (idle) { this.running = false; return; }
    requestAnimationFrame((tt) => this.#frame(tt));
  }
}

export const fx = new FxEngine();

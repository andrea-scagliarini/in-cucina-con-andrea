/**
 * Controllo dei contrasti WCAG 2.1 dei design token (tema chiaro e scuro).
 * Uso: npm run contrast   (esce con codice 1 se qualche coppia non rispetta la soglia)
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../public/css/tokens.css'), 'utf8');

function readBlock(selector) {
  const start = css.indexOf(selector);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  const vars = {};
  for (const m of css.slice(open + 1, close).matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}
const themes = { chiaro: readBlock(':root, [data-theme="light"]'), scuro: readBlock('[data-theme="dark"]') };

/* ---------- colori ---------- */
function parse(v) {
  v = v.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(v);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16)).concat(1);
  m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).concat(1);
  m = /^rgba?\(([^)]+)\)$/.exec(v);
  if (m) { const p = m[1].split(',').map((x) => parseFloat(x)); return [p[0], p[1], p[2], p[3] ?? 1]; }
  throw new Error(`Colore non riconosciuto: ${v}`);
}
const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1); // fg semitrasparente su bg opaco
const mix = (a, b, pa) => [0, 1, 2].map((i) => a[i] * pa + b[i] * (1 - pa)).concat(1);
const lum = ([r, g, b]) => {
  const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

let failures = 0;
for (const [theme, t] of Object.entries(themes)) {
  const c = (n) => parse(t[n]);
  const bg = c('bg'), bgAlt = c('bg-alt'), solid = c('surface-solid');
  const surface = over(c('surface'), bg);
  const accentSoftOnBg = over(c('accent-soft'), bg);
  const stops = [...t['hero-grad'].matchAll(/#[0-9a-f]{6}/gi)].map((m) => parse(m[0]));
  const ERR = parse('#c2332b'), WHITE = parse('#ffffff');
  const ctaStops = [...t['cta-grad'].matchAll(/#[0-9a-f]{6}/gi)].map((m) => parse(m[0]));

  const checks = [
    // [descrizione, primo piano, sfondo, soglia]
    ['Testo principale su sfondo', c('ink'), bg, 4.5],
    ['Testo principale su card', c('ink'), solid, 4.5],
    ['Testo secondario su sfondo', c('ink-soft'), bg, 4.5],
    ['Testo secondario su card', c('ink-soft'), solid, 4.5],
    ['Testo secondario su sfondo alternativo', c('ink-soft'), bgAlt, 4.5],
    ['Testo secondario su header/footer', c('ink-soft'), surface, 4.5],
    ['Link / accento su sfondo', c('accent'), bg, 4.5],
    ['Accento su card', c('accent'), solid, 4.5],
    ['Pill (accento su accento tenue)', c('accent'), accentSoftOnBg, 4.5],
    ['Testo su pulsante principale', c('accent-ink'), c('accent'), 4.5],
    ['Testo su pulsante verde', c('accent-ink'), c('basil'), 4.5],
    ['Testo su pulsante di errore', c('accent-ink'), c('danger'), 4.5],
    ['Pill verde (basilico su tinta)', c('basil'), over([...c('basil').slice(0, 3), 0.16], bg), 4.5],
    ['Pill oro (oro+inchiostro su tinta)', mix(c('gold'), c('ink'), 0.3), over([...c('gold').slice(0, 3), 0.2], bg), 4.5],
    ['Messaggio di errore nei form', c('danger'), bg, 4.5],
    ['Toast "ok" (testo su basilico)', c('accent-ink'), c('basil'), 4.5],
    ['Toast "errore" (bianco su rosso)', WHITE, ERR, 4.5],
    ['Toast base (sfondo su inchiostro)', bg, c('ink'), 4.5],
    ...ctaStops.map((s, i) => [`Newsletter: bianco su gradiente (stop ${i + 1})`, WHITE, s, 4.5]),
    ...stops.map((s, i) => [`Numeri/progresso: gradiente (stop ${i + 1}) su card`, s, solid, 3]),
    ...stops.map((s, i) => [`Numero passaggio/avatar su gradiente (stop ${i + 1}, testo grande)`, c('on-grad'), s, 3]),
  ];

  console.log(`\n=== Tema ${theme} ===`);
  const seen = new Set();
  for (const [label, fg, back, min] of checks) {
    if (seen.has(label)) continue;
    seen.add(label);
    const r = ratio(fg, back);
    const ok = r >= min;
    if (!ok) failures++;
    console.log(`${ok ? '  ok  ' : ' FAIL '} ${r.toFixed(2).padStart(5)} (min ${min})  ${label}`);
  }
}
console.log(failures ? `\n${failures} coppie sotto soglia.` : '\nTutte le coppie rispettano la soglia WCAG AA.');
process.exit(failures ? 1 : 0);

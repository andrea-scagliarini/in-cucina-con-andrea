import { api } from '../api.js';
import { html, armImageFallbacks } from '../ui/dom.js';
import { favorites } from '../store.js';
import { recipeCard, wireCards } from './shared.js';

export async function favoritesView() {
  const ids = favorites.all();
  const { items } = ids.length ? await api.recipes({ ids: ids.join(','), limit: 50 }) : { items: [] };
  return {
    title: 'Preferiti',
    html: html`
      <h1 class="page-title">I tuoi preferiti</h1>
      ${items.length
        ? html`<div class="grid">${items.map(recipeCard)}</div>`
        : html`<div class="empty"><big>🔖</big><h2>Ancora nessun preferito</h2><p>Tocca il cuore su una ricetta per salvarla qui.</p><a class="btn" href="/" data-link>Scopri le ricette</a></div>`}`,
    after(root) { armImageFallbacks(root); this._off = wireCards(root); },
    cleanup() { this._off?.(); },
  };
}

export async function aboutView() {
  return {
    title: 'Chi sono',
    html: html`
      <article class="prose" data-reveal>
        <h1>Ciao, sono <em style="color:var(--accent)">Andrea</em> 👋</h1>
        <p class="hero__lead" style="margin-inline:0;text-align:left">Cucino per passione, scrivo per condividere. Questo blog nasce per raccogliere le ricette che mi hanno insegnato e quelle che ho imparato sbagliando.</p>
        <div class="panel">
          <h2>Come funziona questo blog</h2>
          <ul>
            <li><b>Modalità cucina</b>: un passaggio alla volta, tasti freccia e lettura vocale, con lo schermo che resta acceso.</li>
            <li><b>Timer integrati</b> in ogni passaggio, con suono finale.</li>
            <li><b>Porzioni dinamiche</b>: cambia il numero di persone e le quantità si ricalcolano.</li>
            <li><b>Suoni</b>: attivali con l'altoparlante in alto; tutto è sintetizzato, nessun file da scaricare.</li>
            <li><b>Scorciatoie</b>: <kbd>/</kbd> cerca, <kbd>T</kbd> cambia tema, <kbd>M</kbd> audio.</li>
          </ul>
        </div>
        <p style="margin-top:var(--space-5)"><a class="btn" href="/" data-link>Vai alle ricette →</a></p>
      </article>`,
  };
}

export async function notFoundView() {
  return {
    title: 'Pagina non trovata',
    html: html`<div class="empty"><big>🍝❓</big><h1>404 — il piatto non è in menù</h1><p>La pagina che cerchi non esiste o è stata spostata.</p><a class="btn" href="/" data-link>Torna alla home</a></div>`,
  };
}

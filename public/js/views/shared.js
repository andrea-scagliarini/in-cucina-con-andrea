import { html, media, fmtMinutes, $$, on } from '../ui/dom.js';
import { favorites } from '../store.js';
import { sound } from '../audio/engine.js';
import { fx } from '../fx/engine.js';
import { live } from '../api.js';
import { toast } from '../ui/toast.js';

const diffClass = { Facile: 'pill--basil', Media: 'pill--gold', Difficile: '' };

export function recipeCard(r, i = 0) {
  const fav = favorites.has(r.id);
  return html`
  <article class="card" data-reveal style="--i:${i % 6}" data-id="${r.id}">
    <div class="card__media">
      ${media(r)}
      <span class="pill card__tag">${r.category}</span>
      <button class="card__fav" type="button" data-fav="${r.id}" aria-pressed="${String(fav)}" aria-label="${fav ? 'Rimuovi dai preferiti' : 'Salva nei preferiti'}">${fav ? '♥' : '♡'}</button>
    </div>
    <div class="card__body">
      <h3 class="card__title"><a href="/ricette/${r.slug}" data-link>${r.title}</a></h3>
      <p class="card__excerpt">${r.excerpt}</p>
      <div class="card__meta">
        <span>⏱ ${fmtMinutes(r.totalMinutes)}</span>
        <span class="pill ${diffClass[r.difficulty] ?? ''}">${r.difficulty}</span>
        <span>♥ <b data-likes="${r.id}">${r.likes}</b></span>
        ${r.rating.count ? html`<span>★ ${r.rating.avg.toFixed(1)}</span>` : ''}
      </div>
    </div>
  </article>`;
}

export function skeletonCards(n = 6) {
  return html`${Array.from({ length: n }, () => html`<div class="skeleton card--skeleton"></div>`)}`;
}

/** Gestisce il click sui cuori "preferiti" dentro root e aggiorna i like in tempo reale. */
export function wireCards(root) {
  on(root, 'click', '[data-fav]', (e, btn) => {
    e.preventDefault();
    const id = Number(btn.dataset.fav);
    const added = favorites.toggle(id);
    btn.setAttribute('aria-pressed', added);
    btn.textContent = added ? '♥' : '♡';
    btn.setAttribute('aria-label', added ? 'Rimuovi dai preferiti' : 'Salva nei preferiti');
    if (added) { sound.play('like'); fx.burstFrom(btn, { count: 14 }); toast('Salvata nei preferiti', 'ok', 1800); }
    else sound.play('unlike');
  });
  root.addEventListener('pointerover', (e) => {
    const c = e.target.closest?.('.card');
    if (c && !c.contains(e.relatedTarget)) sound.play('hover');
  });
  return live('likes', ({ id, likes }) => {
    $$(`[data-likes="${id}"]`, root).forEach((el) => { el.textContent = likes; });
  });
}

import { api, live } from '../api.js';
import { html, raw, $, on, debounce, media, fmtMinutes, animateNumber, armImageFallbacks, esc } from '../ui/dom.js';
import { recipeCard, skeletonCards, wireCards } from './shared.js';
import { initHeroMouse, scanReveal } from '../fx/interactions.js';
import { sound } from '../audio/engine.js';
import { fx } from '../fx/engine.js';
import { toast } from '../ui/toast.js';

const SORTS = [['recent', 'Più recenti'], ['popular', 'Più viste'], ['liked', 'Più amate'], ['quick', 'Più veloci']];

function animatedTitle() {
  let n = 0;
  const word = (w, em) => {
    const chars = [...w].map((c) => `<span class="ch" style="--n:${n++}">${esc(c)}</span>`).join('');
    n++;
    return `<span class="word">${em ? `<em>${chars}</em>` : chars}</span>`;
  };
  return raw(`${word('In')} ${word('cucina')} ${word('con')} ${word('Andrea', true)}`);
}

export async function homeView({ query }) {
  const state = { q: query.get('q') ?? '', category: query.get('categoria') ?? '', sort: query.get('ordina') ?? 'recent', page: 1, pages: 1, loading: false };
  let meta;
  try { meta = await api.meta(); } catch { meta = { categories: [], tags: [], stats: { recipes: 0, views: 0, likes: 0, comments: 0 } }; }
  const featuredRes = await api.recipes({ featured: 1, limit: 1, sort: 'popular' }).catch(() => ({ items: [] }));
  const featured = featuredRes.items[0];

  const page = html`
  <section class="hero">
    <div class="hero__blobs" aria-hidden="true"><i class="hero__blob"></i><i class="hero__blob"></i><i class="hero__blob"></i></div>
    <div class="hero__orbit" aria-hidden="true"><span class="hero__emoji">🍝</span><span class="hero__emoji">🍅</span><span class="hero__emoji">🧀</span><span class="hero__emoji">🌶️</span><span class="hero__emoji">🧄</span></div>
    <div>
      <span class="hero__eyebrow">🔥 Cucina pugliese &amp; sapori di casa</span>
      <h1 class="hero__title" aria-label="In cucina con Andrea">${animatedTitle()}</h1>
      <p class="hero__lead">Ricette passo passo con timer, modalità cucina e voce guida. Metti il grembiule: si parte.</p>
      <div class="hero__cta">
        <a class="btn" href="#ricette" id="cta-explore">Esplora le ricette ↓</a>
        <button class="btn btn--ghost" type="button" id="cta-surprise">🎲 Sorprendimi</button>
      </div>
    </div>
    <span class="hero__scroll" aria-hidden="true"></span>
  </section>

  <div class="marquee" aria-hidden="true"><div class="marquee__track">
    ${[...Array(2)].flatMap(() => ['Orecchiette', 'Focaccia', 'Cozze gratinate', 'Sospiri', 'Panzerotti', 'Polpo alla pignata', 'Burrata', 'Taralli']).map((t) => html`<span>${t}</span>`)}
  </div></div>

  ${featured ? html`
  <section class="section" data-reveal aria-labelledby="feat-h">
    <div class="section__head"><h2 id="feat-h">In evidenza</h2><p>La ricetta del momento</p></div>
    <article class="featured">
      <div class="featured__media">${media(featured, { eager: true })}</div>
      <div class="featured__body">
        <div class="chips"><span class="pill">${featured.category}</span><span class="pill pill--gold">⏱ ${fmtMinutes(featured.totalMinutes)}</span></div>
        <h3>${featured.title}</h3>
        <p>${featured.excerpt}</p>
        <div><a class="btn" href="/ricette/${featured.slug}" data-link>Vai alla ricetta →</a></div>
      </div>
    </article>
  </section>` : ''}

  <section class="section" data-reveal>
    <div class="stats" id="stats">
      <div class="stat"><b data-count="${meta.stats.recipes}">0</b><span>ricette</span></div>
      <div class="stat"><b data-count="${meta.stats.views}">0</b><span>visualizzazioni</span></div>
      <div class="stat"><b data-count="${meta.stats.likes}">0</b><span>cuori</span></div>
      <div class="stat"><b data-count="${meta.stats.comments}">0</b><span>commenti</span></div>
    </div>
  </section>

  <section class="section" id="ricette" aria-labelledby="all-h">
    <div class="section__head"><h2 id="all-h">Tutte le ricette</h2><p id="result-count" aria-live="polite"></p></div>
    <div class="filters">
      <div class="search">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="m21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z"/></svg>
        <input class="input" id="q" type="search" placeholder="Cerca una ricetta, un ingrediente, un tag…" value="${state.q}" aria-label="Cerca ricette" autocomplete="off" maxlength="60">
        <kbd aria-hidden="true">/</kbd>
      </div>
      <div class="filters__row">
        <div class="chips" id="cats" role="group" aria-label="Categorie">
          <button class="chip" type="button" data-cat="" aria-pressed="${String(state.category === '')}">Tutte</button>
          ${meta.categories.map((c) => html`<button class="chip" type="button" data-cat="${c.name}" aria-pressed="${String(state.category === c.name)}">${c.name} <small>${c.count}</small></button>`)}
        </div>
        <label class="sr-only" for="sort">Ordina per</label>
        <select class="select" id="sort">${SORTS.map(([v, l]) => html`<option value="${v}" ${v === state.sort ? raw('selected') : ''}>${l}</option>`)}</select>
      </div>
    </div>
    <div class="grid" id="grid" aria-busy="true">${skeletonCards(6)}</div>
    <div class="more"><button class="btn btn--ghost" id="more" type="button" hidden>Carica altre ricette</button></div>
  </section>

  <section class="section" data-reveal>
    <div class="newsletter">
      <h2>Una ricetta nuova, ogni settimana</h2>
      <p>Niente spam: solo piatti, trucchi di cucina e qualche aneddoto di famiglia.</p>
      <form id="news" novalidate>
        <label class="sr-only" for="email">Email</label>
        <input class="input" id="email" type="email" placeholder="la-tua@email.it" required autocomplete="email">
        <button class="btn" type="submit">Iscriviti 💌</button>
      </form>
    </div>
  </section>`;

  const offs = [];
  return {
    title: '',
    html: page,
    wide: false,
    cleanup: () => offs.forEach((f) => f()),
    after(root) {
      offs.push(initHeroMouse(root), wireCards(root));
      armImageFallbacks(root);
      for (const el of root.querySelectorAll('[data-count]')) {
        new IntersectionObserver(([e], o) => { if (e.isIntersecting) { animateNumber(el, Number(el.dataset.count)); o.disconnect(); } }).observe(el);
      }

      const grid = $('#grid', root), more = $('#more', root), count = $('#result-count', root);
      let ctl, seq = 0;

      const syncUrl = () => {
        const p = new URLSearchParams();
        if (state.q) p.set('q', state.q);
        if (state.category) p.set('categoria', state.category);
        if (state.sort !== 'recent') p.set('ordina', state.sort);
        history.replaceState(history.state, '', location.pathname + (p.size ? `?${p}` : ''));
      };

      async function load(reset) {
        if (state.loading && !reset) return;
        ctl?.abort(); ctl = new AbortController();
        const mine = ++seq;
        state.loading = true;
        if (reset) { state.page = 1; grid.setAttribute('aria-busy', 'true'); grid.innerHTML = skeletonCards(3).s; }
        try {
          const res = await api.recipes({ q: state.q, category: state.category, sort: state.sort, page: state.page, limit: 6 }, ctl.signal);
          if (mine !== seq) return;
          state.pages = res.pages;
          const items = res.items;
          const markup = items.length ? items.map((r, i) => recipeCard(r, i).s).join('') : '';
          if (reset) grid.innerHTML = markup || '<div class="empty" style="grid-column:1/-1"><big>🍳</big><h3>Nessuna ricetta trovata</h3><p>Prova con un altro ingrediente o categoria.</p></div>';
          else grid.insertAdjacentHTML('beforeend', markup);
          armImageFallbacks(grid); scanReveal(grid);
          count.textContent = `${res.total} ${res.total === 1 ? 'ricetta' : 'ricette'}`;
          more.hidden = state.page >= state.pages;
        } catch (e) {
          if (e.name !== 'AbortError') toast(e.message, 'error');
        } finally {
          if (mine === seq) { state.loading = false; grid.setAttribute('aria-busy', 'false'); }
        }
      }

      const search = debounce(() => { state.q = $('#q', root).value.trim(); syncUrl(); load(true); }, 280);
      $('#q', root).addEventListener('input', search);
      $('#sort', root).addEventListener('change', (e) => { state.sort = e.target.value; sound.play('click'); syncUrl(); load(true); });
      on(root, 'click', '[data-cat]', (e, b) => {
        state.category = b.dataset.cat; sound.play('click');
        root.querySelectorAll('[data-cat]').forEach((x) => x.setAttribute('aria-pressed', x === b));
        syncUrl(); load(true);
      });
      more.addEventListener('click', () => { state.page++; sound.play('pop'); load(false); });

      // scroll infinito: carica la pagina successiva quando il pulsante entra in vista
      const io = new IntersectionObserver(([e]) => { if (e.isIntersecting && !more.hidden && !state.loading) more.click(); }, { rootMargin: '300px' });
      io.observe(more); offs.push(() => io.disconnect());

      $('#cta-explore', root).addEventListener('click', (e) => { e.preventDefault(); sound.play('sizzle', { dur: 1 }); $('#ricette', root).scrollIntoView({ behavior: 'smooth' }); });
      $('#cta-surprise', root).addEventListener('click', async (e) => {
        sound.play('chop'); fx.burstFrom(e.currentTarget, { count: 20 });
        const all = await api.recipes({ limit: 50 }).catch(() => null);
        if (!all?.items.length) return;
        const pick = all.items[Math.floor(Math.random() * all.items.length)];
        toast(`Stasera: ${pick.title} ${pick.emoji}`, 'ok');
        setTimeout(() => import('../router.js').then((m) => m.navigate(`/ricette/${pick.slug}`)), 900);
      });

      $('#news', root).addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = $('#email', root);
        try {
          const r = await api.subscribe(input.value);
          toast(r.already ? 'Sei già iscritto, grazie!' : 'Iscrizione confermata! 🎉', 'ok');
          if (!r.already) fx.burstFrom(e.submitter ?? input, { count: 30 });
          input.value = '';
        } catch (err) { toast(err.message, 'error'); }
      });

      // nuove ricette in tempo reale
      offs.push(live('recipe', ({ title }) => toast(`Nuova ricetta: ${title} 🍽️ — ricarica per vederla`, 'ok', 5000)));
      document.dispatchEvent(new CustomEvent('home:ready', { detail: root }));
      load(true);
    },
  };
}

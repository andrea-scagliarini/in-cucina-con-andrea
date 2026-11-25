import { api, live, ApiError } from '../api.js';
import { html, $, $$, on, esc, media, fmtMinutes, fmtAmount, fmtDate, fmtDuration, armImageFallbacks } from '../ui/dom.js';
import { favorites, checked } from '../store.js';
import { sound } from '../audio/engine.js';
import { fx } from '../fx/engine.js';
import { toast } from '../ui/toast.js';
import { recipeCard, wireCards } from './shared.js';

const commentHtml = (c) => html`
  <article class="comment" data-cid="${c.id}">
    <div class="avatar" aria-hidden="true">${[...c.author][0].toUpperCase()}</div>
    <div><header><b>${c.author}</b><time datetime="${c.createdAt}">${fmtDate(c.createdAt)}</time></header><p>${c.body}</p></div>
  </article>`;

const ingredientLine = (ing, scale, i) => html`
  <li data-i="${i}" data-amount="${ing.amount ?? ''}" role="checkbox" aria-checked="false" tabindex="0">
    <span>${ing.amount != null ? html`<b>${fmtAmount(ing.amount * scale)}</b> ${ing.unit} ` : ''}${ing.name}</span>
  </li>`;

export async function recipeView({ params }) {
  const data = await api.recipe(params.slug);
  const r = data.recipe;
  const state = { servings: r.servings, liked: data.liked, myRating: data.myRating };
  const done = new Set(checked.get(r.id));

  const page = html`
  <article>
    <header class="rhero">
      <div data-parallax="0.18" class="rhero__bg">${media(r, { eager: true, sizes: '100vw' })}</div>
      <div class="rhero__inner">
        <nav class="crumbs" aria-label="Percorso"><a href="/" data-link>Ricette</a><span>/</span><a href="/?categoria=${encodeURIComponent(r.category)}" data-link>${r.category}</a></nav>
        <h1>${r.title}</h1>
      </div>
    </header>

    <p class="hero__lead" style="max-width:70ch;color:var(--ink-soft)">${r.excerpt}</p>

    <div class="rmeta" data-reveal>
      <div class="stat"><b>${fmtMinutes(r.prepMinutes)}</b><span>Preparazione</span></div>
      <div class="stat"><b>${fmtMinutes(r.cookMinutes)}</b><span>Cottura</span></div>
      <div class="stat"><b>${r.difficulty}</b><span>Difficoltà</span></div>
      <div class="stat"><b data-views>${r.views.toLocaleString('it-IT')}</b><span>Visualizzazioni</span></div>
    </div>

    <div class="actions">
      <button class="btn like" id="like" type="button" aria-pressed="${String(state.liked)}"><span class="heart">♥</span> <span id="like-n">${r.likes}</span> Mi piace</button>
      <button class="btn btn--ghost" id="fav" type="button" aria-pressed="${String(favorites.has(r.id))}">🔖 <span>${favorites.has(r.id) ? 'Salvata' : 'Salva'}</span></button>
      <button class="btn btn--basil" id="cook" type="button">👨‍🍳 Modalità cucina</button>
      <button class="btn btn--ghost" id="share" type="button">↗ Condividi</button>
      <button class="btn btn--ghost" id="print" type="button">🖨 Stampa</button>
    </div>

    <div class="rlayout">
      <aside class="panel sticky" data-reveal aria-labelledby="ing-h">
        <h2 id="ing-h">Ingredienti</h2>
        <div class="scaler" role="group" aria-label="Porzioni">
          <button type="button" id="dec" aria-label="Meno porzioni">−</button>
          <output id="servings" aria-live="polite">${r.servings} porzioni</output>
          <button type="button" id="inc" aria-label="Più porzioni">+</button>
        </div>
        <ul class="ingredients" id="ingredients">${r.ingredients.map((ing, i) => ingredientLine(ing, 1, i))}</ul>
        <p class="stat" style="margin-top:1rem;text-align:left;padding:.6rem 1rem"><span>Tocca un ingrediente per spuntarlo</span></p>
      </aside>

      <section aria-labelledby="steps-h" data-reveal>
        <h2 id="steps-h" style="font-size:var(--step-2)">Preparazione</h2>
        <ol class="steps" id="steps">
          ${r.steps.map((s, i) => html`<li data-step="${i}"><p>${s.text}</p>
            ${s.timer ? html`<div class="timer" data-timer="${s.timer}" data-step="${i}"><button class="btn btn--small btn--ghost" type="button" data-start>⏱ Avvia timer</button><span class="timer__ring" hidden><span>${fmtDuration(s.timer)}</span></span></div>` : ''}</li>`)}
        </ol>
        ${r.tags.length ? html`<div class="chips" style="margin-top:var(--space-5)">${r.tags.map((t) => html`<a class="chip" href="/?q=${encodeURIComponent(t)}" data-link>#${t}</a>`)}</div>` : ''}
      </section>
    </div>

    <section class="section panel" data-reveal aria-labelledby="rate-h">
      <h2 id="rate-h">Cosa ne pensi?</h2>
      <div class="rating-box">
        <div class="stars" id="stars" role="radiogroup" aria-label="Il tuo voto">
          ${[1, 2, 3, 4, 5].map((i) => html`<button type="button" class="star ${i <= state.myRating ? 'on' : ''}" data-star="${i}" role="radio" aria-checked="${String(i === state.myRating)}" aria-label="${i} stelle">★</button>`)}
        </div>
        <span id="rating-label">${r.rating.count ? html`<b>${r.rating.avg.toFixed(1)}</b> · ${r.rating.count} ${r.rating.count === 1 ? 'voto' : 'voti'}` : 'Sii il primo a votare'}</span>
      </div>
    </section>

    <section class="section" id="comments" aria-labelledby="com-h" data-reveal>
      <h2 id="com-h" style="font-size:var(--step-2)">Commenti <span class="pill" id="com-n">${data.comments.length}</span></h2>
      <form class="panel" id="comment-form" novalidate>
        <div class="row">
          <div class="field"><label for="c-author">Nome</label><input class="input" id="c-author" maxlength="40" required autocomplete="nickname"></div>
        </div>
        <div class="field"><label for="c-body">Commento</label><textarea class="textarea" id="c-body" maxlength="1000" required placeholder="Com'è venuta? Hai cambiato qualcosa?"></textarea></div>
        <div class="form-error" id="c-err" role="alert"></div>
        <button class="btn" type="submit">Pubblica commento</button>
      </form>
      <div class="comments" id="comment-list">${data.comments.map(commentHtml)}</div>
    </section>

    ${data.related.length ? html`<section class="section" aria-labelledby="rel-h"><div class="section__head"><h2 id="rel-h">Potrebbe piacerti anche</h2></div><div class="grid">${data.related.map(recipeCard)}</div></section>` : ''}
  </article>`;

  const offs = [];
  const timers = new Map();
  let cookEl = null;
  let closeCook = () => {};

  return {
    title: r.title,
    html: page,
    cleanup() {
      offs.forEach((f) => f());
      timers.forEach((t) => clearInterval(t.id));
      timers.clear();
      closeCook();
      speechSynthesis?.cancel?.();
    },
    after(root) {
      armImageFallbacks(root);
      offs.push(wireCards(root));
      /* --- ingredienti: spunta, scala porzioni --- */
      const list = $('#ingredients', root);
      const applyDone = () => $$('li', list).forEach((li) => { const on_ = done.has(Number(li.dataset.i)); li.classList.toggle('done', on_); li.setAttribute('aria-checked', on_); });
      const toggleIng = (li) => {
        const i = Number(li.dataset.i);
        done.has(i) ? (done.delete(i), sound.play('uncheck')) : (done.add(i), sound.play('check'));
        checked.set(r.id, [...done]);
        applyDone();
        if (done.size === r.ingredients.length) { toast('Hai tutti gli ingredienti! Ai fornelli 🔥', 'ok'); fx.burstFrom(li, { count: 18 }); }
      };
      on(list, 'click', 'li', (e, li) => toggleIng(li));
      on(list, 'keydown', 'li', (e, li) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleIng(li); } });
      applyDone();

      const rescale = () => {
        const scale = state.servings / r.servings;
        $$('li', list).forEach((li) => {
          const ing = r.ingredients[Number(li.dataset.i)];
          if (ing.amount != null) $('b', li).textContent = fmtAmount(ing.amount * scale);
        });
        $('#servings', root).textContent = `${state.servings} ${state.servings === 1 ? 'porzione' : 'porzioni'}`;
      };
      $('#dec', root).addEventListener('click', () => { if (state.servings > 1) { state.servings--; sound.play('click'); rescale(); } });
      $('#inc', root).addEventListener('click', () => { if (state.servings < 50) { state.servings++; sound.play('click'); rescale(); } });

      /* --- like / preferiti / condividi / stampa --- */
      const likeBtn = $('#like', root);
      likeBtn.addEventListener('click', async () => {
        try {
          const res = await api.like(r.id);
          state.liked = res.liked;
          likeBtn.setAttribute('aria-pressed', res.liked);
          $('#like-n', root).textContent = res.likes;
          if (res.liked) { sound.play('like'); fx.burstFrom(likeBtn, { count: 32 }); } else sound.play('unlike');
        } catch (e) { toast(e.message, 'error'); }
      });
      offs.push(live('likes', ({ id, likes }) => { if (id === r.id) $('#like-n', root).textContent = likes; }));

      const favBtn = $('#fav', root);
      favBtn.addEventListener('click', () => {
        const added = favorites.toggle(r.id);
        favBtn.setAttribute('aria-pressed', added);
        $('span', favBtn).textContent = added ? 'Salvata' : 'Salva';
        added ? (sound.play('success'), fx.burstFrom(favBtn, { count: 18 })) : sound.play('unlike');
      });

      $('#share', root).addEventListener('click', async () => {
        const data_ = { title: r.title, text: r.excerpt, url: location.href };
        try {
          if (navigator.share) await navigator.share(data_);
          else { await navigator.clipboard.writeText(location.href); toast('Link copiato negli appunti', 'ok'); }
        } catch (e) { if (e.name !== 'AbortError') toast('Impossibile condividere', 'error'); }
      });
      $('#print', root).addEventListener('click', () => print());

      /* --- timer dei passaggi --- */
      on(root, 'click', '[data-start]', (e, btn) => startTimer(btn.closest('.timer')));

      function startTimer(box, onTick) {
        const key = box.dataset.step;
        if (timers.has(key)) { clearInterval(timers.get(key).id); timers.delete(key); }
        const total = Number(box.dataset.timer);
        const ring = $('.timer__ring', box), label = $('.timer__ring span', box), btn = $('[data-start]', box);
        let left = total; box.classList.remove('done');
        ring.hidden = false; btn.textContent = '↺ Riavvia';
        sound.play('click');
        const paint = () => { ring.style.setProperty('--p', ((total - left) / total) * 100); label.textContent = fmtDuration(left); onTick?.(left); };
        paint();
        const id = setInterval(() => {
          left--; paint();
          if (left > 0 && left <= 3) sound.play('tick');
          if (left <= 0) {
            clearInterval(id); timers.delete(key); box.classList.add('done');
            sound.play('bell'); navigator.vibrate?.([200, 100, 200]);
            toast(`Timer finito: passaggio ${Number(key) + 1} ⏰`, 'ok', 5000);
            if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification('Timer finito!', { body: `${r.title}: passaggio ${Number(key) + 1}` });
          }
        }, 1000);
        timers.set(key, { id });
        if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
      }

      /* --- modalità cucina: un passaggio alla volta, tasti, voce, schermo sempre acceso --- */
      let wake = null, speak = false, idx = 0;
      const speakStep = () => {
        if (!speak || !('speechSynthesis' in window)) return;
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(`Passaggio ${idx + 1}. ${r.steps[idx].text}`);
        u.lang = 'it-IT'; u.rate = 0.95; speechSynthesis.speak(u);
      };
      function renderCook() {
        const s = r.steps[idx], last = idx === r.steps.length - 1;
        cookEl.innerHTML = `
          <div class="cook__top"><b>${esc(r.title)}</b>
            <span><button class="btn btn--small btn--ghost" data-c="voice" aria-pressed="${speak}">${speak ? '🔊 Voce attiva' : '🔈 Leggi ad alta voce'}</button>
            <button class="btn btn--small btn--ghost" data-c="close" aria-label="Chiudi modalità cucina">✕ Esci</button></span></div>
          <div class="cook__bar"><i style="width:${((idx + 1) / r.steps.length) * 100}%"></i></div>
          <div class="cook__stage"><div><div class="cook__num">${idx + 1}</div><p class="cook__text">${esc(s.text)}</p>
            ${s.timer ? `<div class="timer" data-timer="${s.timer}" data-step="cook${idx}"><button class="btn" data-start>⏱ Timer ${fmtDuration(s.timer)}</button><span class="timer__ring" hidden><span></span></span></div>` : ''}</div></div>
          <div class="cook__nav"><button class="btn btn--ghost" data-c="prev" ${idx === 0 ? 'disabled' : ''}>← Indietro</button>
            <button class="btn" data-c="next">${last ? 'Fatto! 🎉' : 'Avanti →'}</button></div>`;
        speakStep();
      }
      function openCook() {
        idx = 0; cookEl = document.createElement('div'); cookEl.className = 'cook'; cookEl.setAttribute('role', 'dialog'); cookEl.setAttribute('aria-label', 'Modalità cucina');
        document.body.append(cookEl); document.body.style.overflow = 'hidden';
        navigator.wakeLock?.request('screen').then((w) => { wake = w; }).catch(() => {});
        sound.play('sizzle', { dur: 1.2 }); renderCook();
        cookEl.addEventListener('click', (e) => {
          const t = e.target.closest('[data-c],[data-start]'); if (!t) return;
          if (t.dataset.start !== undefined) return startTimer(t.closest('.timer'));
          const a = t.dataset.c;
          if (a === 'close') closeCook();
          else if (a === 'voice') { speak = !speak; if (!speak) speechSynthesis.cancel(); renderCook(); }
          else if (a === 'prev' && idx > 0) { idx--; sound.play('click'); renderCook(); }
          else if (a === 'next') {
            if (idx < r.steps.length - 1) { idx++; sound.play('pop'); renderCook(); }
            else { sound.play('success'); fx.burst(innerWidth / 2, innerHeight / 2, { count: 60 }); toast('Buon appetito! 🍽️', 'ok'); closeCook(); }
          }
        });
        addEventListener('keydown', cookKeys);
      }
      function cookKeys(e) {
        if (!cookEl) return;
        if (e.key === 'Escape') closeCook();
        else if (e.key === 'ArrowRight') $('[data-c="next"]', cookEl)?.click();
        else if (e.key === 'ArrowLeft') $('[data-c="prev"]', cookEl)?.click();
      }
      $('#cook', root).addEventListener('click', openCook);
      closeCook = () => {
        if (!cookEl) return;
        cookEl.remove(); cookEl = null; document.body.style.overflow = '';
        wake?.release?.().catch(() => {}); wake = null; speechSynthesis?.cancel?.();
        removeEventListener('keydown', cookKeys);
      };

      /* --- voto a stelle --- */
      const starsBox = $('#stars', root);
      const paintStars = (n) => $$('.star', starsBox).forEach((s) => s.classList.toggle('on', Number(s.dataset.star) <= n));
      on(starsBox, 'pointerover', '.star', (e, s) => paintStars(Number(s.dataset.star)));
      starsBox.addEventListener('pointerleave', () => paintStars(state.myRating));
      on(starsBox, 'click', '.star', async (e, s) => {
        const n = Number(s.dataset.star);
        try {
          const res = await api.rate(r.id, n);
          state.myRating = n; paintStars(n);
          $$('.star', starsBox).forEach((x) => x.setAttribute('aria-checked', Number(x.dataset.star) === n));
          sound.play('star', { n }); fx.burstFrom(s, { count: 12, emoji: false });
          $('#rating-label', root).innerHTML = `<b>${res.rating.avg.toFixed(1)}</b> · ${res.rating.count} ${res.rating.count === 1 ? 'voto' : 'voti'}`;
        } catch (err) { toast(err.message, 'error'); }
      });
      offs.push(live('rating', ({ id, avg, count }) => { if (id === r.id) $('#rating-label', root).innerHTML = `<b>${avg.toFixed(1)}</b> · ${count} ${count === 1 ? 'voto' : 'voti'}`; }));

      /* --- commenti --- */
      const listEl = $('#comment-list', root), countEl = $('#com-n', root);
      const addComment = (c) => {
        if ($(`[data-cid="${c.id}"]`, listEl)) return;
        listEl.insertAdjacentHTML('afterbegin', commentHtml(c).s);
        countEl.textContent = listEl.children.length;
      };
      $('#comment-form', root).addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = $('#c-err', root);
        err.textContent = '';
        try {
          const { comment } = await api.comment(r.id, { author: $('#c-author', root).value, body: $('#c-body', root).value });
          addComment(comment); $('#c-body', root).value = '';
          sound.play('success'); fx.burstFrom(e.submitter, { count: 16 }); toast('Commento pubblicato!', 'ok');
        } catch (ex) { err.textContent = ex instanceof ApiError ? ex.message : 'Errore imprevisto'; sound.play('error'); }
      });
      offs.push(live('comment', ({ recipeId, comment }) => { if (recipeId === r.id) addComment(comment); }));
    },
  };

}

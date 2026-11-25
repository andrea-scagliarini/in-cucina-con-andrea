import { api, ApiError } from '../api.js';
import { html, raw, $, on, fmtDate } from '../ui/dom.js';
import { session } from '../store.js';
import { toast } from '../ui/toast.js';
import { sound } from '../audio/engine.js';
import { fx } from '../fx/engine.js';
import { navigate } from '../router.js';

const CATEGORIES = ['Antipasti', 'Primi', 'Secondi', 'Dolci', 'Lievitati', 'Contorni'];
const DIFFS = ['Facile', 'Media', 'Difficile'];

/* ---------- parsing / serializzazione degli ingredienti e dei passaggi ---------- */
const UNITS = 'kg|g|ml|cl|l|cucchiaio|cucchiai|cucchiaino|cucchiaini|spicchio|spicchi|mazzetto|bicchiere|pizzico|foglia|foglie|fetta|fette|pz';
const ING_RE = new RegExp(`^(?:(\\d+(?:[.,]\\d+)?)\\s*(?:(${UNITS})\\b)?\\s+)?(.+)$`, 'i');

export function parseIngredients(text) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const m = ING_RE.exec(line);
    return { amount: m[1] ? Number(m[1].replace(',', '.')) : null, unit: (m[2] ?? '').toLowerCase(), name: m[3].trim() };
  });
}
export const stringifyIngredients = (list) => list.map((i) => [i.amount ?? '', i.unit, i.name].filter((x) => x !== '').join(' ')).join('\n');

export function parseSteps(text) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const m = /^\[(\d+)\]\s*(.+)$/.exec(line);
    return m ? { text: m[2], timer: Number(m[1]) * 60 } : { text: line, timer: null };
  });
}
export const stringifySteps = (list) => list.map((s) => (s.timer ? `[${Math.ceil(s.timer / 60)}] ${s.text}` : s.text)).join('\n');

/* ---------- vista principale (login o dashboard) ---------- */
export async function adminView() {
  if (!session.token()) return loginView();
  let stats, recipes;
  try {
    [stats, recipes] = await Promise.all([api.stats(), api.recipes({ all: 1, limit: 50, sort: 'recent' })]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return loginView();
    throw e;
  }
  const t = stats.totals, max = Math.max(1, ...stats.top.map((x) => x.views));
  const hasExternal = recipes.items.filter((r) => /^https?:\/\//.test(r.image)).length;

  return {
    title: 'Area autore',
    html: html`
    <div class="admin-bar"><h1 class="page-title" style="margin:0">Area autore</h1>
      <div class="chips"><a class="btn" href="/admin/nuova" data-link>＋ Nuova ricetta</a><button class="btn btn--ghost" id="logout" type="button">Esci</button></div></div>
    <div class="stats" data-reveal>
      ${[['recipes', 'ricette'], ['drafts', 'bozze'], ['views', 'visualizzazioni'], ['likes', 'cuori'], ['comments', 'commenti'], ['subscribers', 'iscritti']]
        .map(([k, l]) => html`<div class="stat"><b>${t[k].toLocaleString('it-IT')}</b><span>${l}</span></div>`)}
    </div>
    <div class="admin-grid" style="margin-top:var(--space-5)">
      <section class="panel" data-reveal><h2>Ricette più viste</h2>
        <div class="bars">${stats.top.map((x, i) => html`<div class="bar"><span>${x.title}</span><i style="width:${(x.views / max) * 100}%;animation-delay:${i * 90}ms"></i><b>${x.views}</b></div>`)}</div></section>
      <section class="panel" data-reveal><h2>Ricette</h2>
        <div class="table-wrap"><table class="table"><thead><tr><th>Titolo</th><th>Categoria</th><th class="num">Viste</th><th class="num">♥</th><th>Stato</th><th></th></tr></thead><tbody>
          ${recipes.items.map((r) => html`<tr data-id="${r.id}"><td><a href="/ricette/${r.slug}" data-link>${r.emoji} ${r.title}</a></td><td>${r.category}</td><td class="num">${r.views}</td><td class="num">${r.likes}</td>
            <td>${r.published ? html`<span class="pill pill--basil">Pubblicata</span>` : html`<span class="pill pill--gold">Bozza</span>`}${r.featured ? html` <span class="pill">★</span>` : ''}</td>
            <td><div class="acts"><a class="btn btn--small btn--ghost" href="/admin/modifica/${r.id}" data-link>Modifica</a><button class="btn btn--small btn--danger" data-del="${r.id}" data-title="${r.title}" type="button">Elimina</button></div></td></tr>`)}
        </tbody></table></div></section>
      <section class="panel" data-reveal><h2>Ultimi commenti</h2>
        ${stats.comments.length ? html`<div class="table-wrap"><table class="table"><tbody>${stats.comments.map((c) => html`<tr><td><b>${c.author}</b> su <a href="/ricette/${c.slug}" data-link>${c.recipe}</a><br><span style="color:var(--ink-soft)">${c.body}</span></td><td>${fmtDate(c.createdAt)}</td><td><button class="btn btn--small btn--danger" data-delc="${c.id}" type="button">Elimina</button></td></tr>`)}</tbody></table></div>` : html`<p>Nessun commento ancora.</p>`}</section>
      <section class="panel" data-reveal><h2>Manutenzione</h2>
        <p id="maint-info">Backup disponibili: <b id="bk-n">…</b>${hasExternal ? html` · <span class="pill pill--gold">${hasExternal} immagini su siti esterni</span>` : ''}</p>
        <div class="chips"><button class="btn btn--ghost" id="backup" type="button">💾 Crea backup ora</button>
          <button class="btn btn--ghost" id="localize" type="button" ${hasExternal ? '' : raw('disabled')}>🖼 Ospita le immagini in locale</button></div>
        <p style="color:var(--ink-soft);font-size:var(--step--1);margin-top:var(--space-3)">I backup automatici sono in <code>data/backups</code>. Le immagini caricate in <code>data/uploads</code> vanno copiate a parte.</p></section>
      <section class="panel" data-reveal><h2>Iscritti alla newsletter</h2><p>${t.subscribers} iscritti.</p><button class="btn btn--ghost" id="export" type="button" ${t.subscribers ? '' : raw('disabled')}>Esporta CSV</button></section>
    </div>`,
    after(root) {
      $('#logout', root).addEventListener('click', () => { session.clear(); sound.play('click'); toast('Disconnesso'); navigate('/admin', { replace: true }); });
      on(root, 'click', '[data-del]', async (e, b) => {
        if (!confirm(`Eliminare definitivamente "${b.dataset.title}"?`)) return;
        try { await api.deleteRecipe(b.dataset.del); toast('Ricetta eliminata', 'ok'); b.closest('tr').remove(); } catch (err) { toast(err.message, 'error'); }
      });
      on(root, 'click', '[data-delc]', async (e, b) => {
        try { await api.deleteComment(b.dataset.delc); b.closest('tr').remove(); sound.play('chop'); } catch (err) { toast(err.message, 'error'); }
      });
      api.backups().then(({ items }) => { $('#bk-n', root).textContent = items.length; }).catch(() => {});
      $('#backup', root).addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          const { backup } = await api.backupNow();
          toast(`Backup creato: ${backup.name}`, 'ok');
          const { items } = await api.backups();
          $('#bk-n', root).textContent = items.length;
        } catch (err) { toast(err.message, 'error'); } finally { btn.disabled = false; }
      });
      $('#localize', root).addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        toast('Scarico le immagini…');
        try {
          const r = await api.localizeImages();
          toast(`${r.done} immagini su ${r.total} ospitate in locale`, r.done === r.total ? 'ok' : 'error', 5000);
          if (r.done) setTimeout(() => navigate('/admin', { replace: true }), 1200);
        } catch (err) { toast(err.message, 'error'); } finally { btn.disabled = false; }
      });
      $('#export', root)?.addEventListener('click', async () => {
        const { items } = await api.subscribers();
        const csv = `email,iscritto_il\n${items.map((i) => `${i.email},${i.createdAt}`).join('\n')}`;
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: 'iscritti.csv' });
        a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      });
    },
  };
}

function loginView() {
  return {
    title: 'Accesso autore',
    html: html`
    <div class="panel auth-card" data-reveal>
      <h1 style="font-size:var(--step-2)">🔐 Accesso autore</h1>
      <form id="login" novalidate>
        <div class="field"><label for="u">Utente</label><input class="input" id="u" autocomplete="username" required></div>
        <div class="field"><label for="p">Password</label><input class="input" id="p" type="password" autocomplete="current-password" required></div>
        <div class="form-error" id="err" role="alert"></div>
        <button class="btn" type="submit">Entra</button>
      </form>
    </div>`,
    after(root) {
      $('#u', root).focus();
      $('#login', root).addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const res = await api.login($('#u', root).value, $('#p', root).value);
          session.set(res.token); sound.play('success'); fx.burstFrom(e.submitter, { count: 24 });
          toast(`Bentornato, ${res.user.name}!`, 'ok');
          navigate('/admin', { replace: true });
        } catch (err) { $('#err', root).textContent = err.message; sound.play('error'); }
      });
    },
  };
}

/* ---------- editor ricetta ---------- */
export async function editorView({ params }) {
  if (!session.token()) return loginView();
  const editing = params.id != null;
  let r = { title: '', excerpt: '', category: 'Primi', difficulty: 'Facile', prepMinutes: 15, cookMinutes: 15, servings: 4, image: '', emoji: '🍽️', ingredients: [], steps: [], tags: [], featured: false, published: true };
  if (editing) {
    try { r = (await api.adminRecipe(params.id)).recipe; } catch (e) { if (e.status === 401) return loginView(); throw e; }
  }
  const sel = (list, v) => list.map((x) => html`<option ${x === v ? raw('selected') : ''}>${x}</option>`);

  return {
    title: editing ? 'Modifica ricetta' : 'Nuova ricetta',
    html: html`
    <div class="admin-bar"><h1 class="page-title" style="margin:0">${editing ? 'Modifica ricetta' : 'Nuova ricetta'}</h1><a class="btn btn--ghost" href="/admin" data-link>← Torna all'area autore</a></div>
    <form class="panel" id="editor" novalidate>
      <div class="field"><label for="title">Titolo *</label><input class="input" id="title" maxlength="120" value="${r.title}" required></div>
      <div class="field"><label for="excerpt">Descrizione breve</label><textarea class="textarea" id="excerpt" maxlength="400" style="min-height:80px">${r.excerpt}</textarea></div>
      <div class="row">
        <div class="field"><label for="category">Categoria</label><select class="select" id="category">${sel(CATEGORIES, r.category)}</select></div>
        <div class="field"><label for="difficulty">Difficoltà</label><select class="select" id="difficulty">${sel(DIFFS, r.difficulty)}</select></div>
        <div class="field"><label for="prep">Preparazione (min)</label><input class="input" id="prep" type="number" min="0" max="2880" value="${r.prepMinutes}"></div>
        <div class="field"><label for="cook">Cottura (min)</label><input class="input" id="cook" type="number" min="0" max="2880" value="${r.cookMinutes}"></div>
        <div class="field"><label for="servings">Porzioni</label><input class="input" id="servings" type="number" min="1" max="100" value="${r.servings}"></div>
        <div class="field"><label for="emoji">Emoji</label><input class="input" id="emoji" maxlength="8" value="${r.emoji}"></div>
      </div>
      <div class="field"><span class="label">Immagine</span>
        <label class="drop" id="drop" for="file"><span>📷 Trascina qui un'immagine o clicca per caricarla</span><small>PNG, JPG, WEBP o GIF · max 5 MB</small>${r.image ? html`<img src="${r.image}" alt="Anteprima" id="preview" referrerpolicy="no-referrer">` : html`<img id="preview" alt="Anteprima" hidden>`}</label>
        <input id="file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
        <input class="input" id="image" placeholder="…oppure incolla un URL https://" value="${r.image}"></div>
      <div class="field"><label for="ingredients">Ingredienti (uno per riga)</label><textarea class="textarea" id="ingredients" placeholder="320 g orecchiette&#10;2 spicchi aglio&#10;sale q.b.">${stringifyIngredients(r.ingredients)}</textarea><small>Formato: quantità, unità, nome. Le quantità si scalano con le porzioni.</small></div>
      <div class="field"><label for="steps">Passaggi (uno per riga)</label><textarea class="textarea" id="steps" style="min-height:200px" placeholder="Porta a bollore l'acqua.&#10;[12] Cuoci la pasta.">${stringifySteps(r.steps)}</textarea><small>Anteponi <code>[minuti]</code> per aggiungere un timer al passaggio, es. <code>[12] Cuoci la pasta</code>.</small></div>
      <div class="field"><label for="tags">Tag (separati da virgola)</label><input class="input" id="tags" value="${r.tags.join(', ')}"></div>
      <div class="chips" style="margin-bottom:var(--space-4)">
        <label class="check"><input type="checkbox" id="featured" ${r.featured ? raw('checked') : ''}> In evidenza</label>
        <label class="check"><input type="checkbox" id="published" ${r.published ? raw('checked') : ''}> Pubblicata</label>
      </div>
      <div class="form-error" id="err" role="alert"></div>
      <button class="btn" type="submit">${editing ? 'Salva modifiche' : 'Pubblica ricetta'}</button>
    </form>`,
    after(root) {
      const img = $('#image', root), preview = $('#preview', root);
      const showPreview = () => { preview.hidden = !img.value; if (img.value) preview.src = img.value; };
      img.addEventListener('input', showPreview);

      async function upload(file) {
        if (!file) return;
        try {
          toast('Caricamento…');
          const { url } = await api.upload(file);
          img.value = url; showPreview(); toast('Immagine caricata', 'ok');
        } catch (e) { toast(e.message, 'error'); }
      }
      $('#file', root).addEventListener('change', (e) => upload(e.target.files[0]));
      const drop = $('#drop', root);
      ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
      ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
      drop.addEventListener('drop', (e) => upload(e.dataTransfer.files[0]));

      $('#editor', root).addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = (id) => $(`#${id}`, root).value;
        const body = {
          title: v('title'), excerpt: v('excerpt'), category: v('category'), difficulty: v('difficulty'),
          prepMinutes: v('prep'), cookMinutes: v('cook'), servings: v('servings'), emoji: v('emoji'), image: v('image').trim(),
          ingredients: parseIngredients(v('ingredients')), steps: parseSteps(v('steps')),
          tags: v('tags').split(',').map((t) => t.trim()).filter(Boolean),
          featured: $('#featured', root).checked, published: $('#published', root).checked,
        };
        try {
          const { recipe } = editing ? await api.updateRecipe(r.id, body) : await api.createRecipe(body);
          sound.play('success'); fx.burstFrom(e.submitter, { count: 36 });
          toast(editing ? 'Modifiche salvate' : 'Ricetta pubblicata! 🎉', 'ok');
          navigate(`/ricette/${recipe.slug}`);
        } catch (err) {
          $('#err', root).textContent = err instanceof ApiError ? err.message : 'Errore imprevisto';
          sound.play('error');
        }
      });
    },
  };
}


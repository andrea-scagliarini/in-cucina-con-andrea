import { api } from '../api.js';
import { html, armImageFallbacks } from '../ui/dom.js';
import { favorites } from '../store.js';
import { toast } from '../ui/toast.js';
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

export async function privacyView() {
  const meta = await api.meta().catch(() => ({ site: {} }));
  const name = meta.site?.ownerName || 'Andrea (autore del blog)';
  const mail = meta.site?.ownerEmail;
  return {
    title: 'Informativa sulla privacy',
    html: html`
    <article class="prose legal" data-reveal>
      <h1>Informativa sulla privacy</h1>
      <p class="hero__lead" style="margin-inline:0;text-align:left">In breve: niente tracciamento, niente pubblicità, niente servizi di terzi. Raccogliamo solo ciò che serve per far funzionare il blog.</p>

      <h2>Titolare del trattamento</h2>
      <p>${name}. Contatto per esercitare i tuoi diritti: ${mail ? html`<a href="mailto:${mail}">${mail}</a>` : html`<em>indirizzo non ancora configurato</em>`}.</p>

      <h2>Quali dati trattiamo e perché</h2>
      <div class="table-wrap"><table class="table"><thead><tr><th>Dato</th><th>Finalità</th><th>Base giuridica</th><th>Conservazione</th></tr></thead><tbody>
        <tr><td><b>Email</b> (newsletter) e data del consenso</td><td>Inviarti la newsletter</td><td>Consenso (art. 6.1.a GDPR)</td><td>Finché non ti cancelli</td></tr>
        <tr><td><b>Nome e testo</b> dei commenti</td><td>Pubblicare il tuo commento sotto la ricetta</td><td>Consenso, che dai inviandolo</td><td>Finché non ne chiedi la rimozione</td></tr>
        <tr><td><b>Voti e "mi piace"</b></td><td>Mostrare le valutazioni e impedire voti ripetuti</td><td>Legittimo interesse</td><td>Finché la ricetta esiste. Sono legati a un codice casuale, non a te.</td></tr>
        <tr><td><b>Indirizzo IP</b></td><td>Limitare abusi (spam, tentativi di accesso)</td><td>Legittimo interesse alla sicurezza</td><td>Solo in memoria per pochi minuti, non viene salvato</td></tr>
      </tbody></table></div>

      <h2>Cosa salviamo nel tuo browser</h2>
      <p>Usiamo solo il <b>localStorage</b> del browser, strettamente necessario al funzionamento e <b>mai usato per profilarti</b>: un codice casuale anonimo (per i "mi piace" e i voti), i tuoi preferiti, gli ingredienti spuntati, il tema e le preferenze audio. Non usiamo cookie di profilazione né strumenti di analisi di terze parti, quindi non è necessario un banner per i cookie. Puoi cancellare questi dati in qualsiasi momento dalle impostazioni del browser.</p>

      <h2>Con chi li condividiamo</h2>
      <p>Con nessuno. I dati restano sul server del blog e non vengono venduti né ceduti. Le immagini delle ricette sono ospitate dal blog stesso.</p>

      <h2>I tuoi diritti</h2>
      <p>Puoi chiedere accesso, rettifica, cancellazione, limitazione e portabilità dei tuoi dati e opporti al trattamento (artt. 15-22 GDPR) scrivendo al contatto indicato sopra. Puoi inoltre proporre reclamo al <a href="https://www.garanteprivacy.it" target="_blank" rel="noopener noreferrer">Garante per la protezione dei dati personali</a>.</p>

      <h2>Cancellati dalla newsletter</h2>
      <form class="panel" id="unsub" novalidate>
        <div class="field"><label for="unsub-email">La tua email</label><input class="input" id="unsub-email" type="email" required autocomplete="email"></div>
        <button class="btn" type="submit">Cancella i miei dati dalla newsletter</button>
      </form>

      <p style="color:var(--ink-soft);font-size:var(--step--1);margin-top:var(--space-5)">Ultimo aggiornamento: novembre 2026.</p>
    </article>`,
    after(root) {
      root.querySelector('#unsub').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await api.unsubscribe(root.querySelector('#unsub-email').value);
          toast("Se l'indirizzo era iscritto, è stato cancellato.", 'ok');
          root.querySelector('#unsub-email').value = '';
        } catch (err) { toast(err.message, 'error'); }
      });
    },
  };
}

export async function notFoundView() {
  return {
    title: 'Pagina non trovata',
    html: html`<div class="empty"><big>🍝❓</big><h1>404 — il piatto non è in menù</h1><p>La pagina che cerchi non esiste o è stata spostata.</p><a class="btn" href="/" data-link>Torna alla home</a></div>`,
  };
}

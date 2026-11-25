import { esc } from './dom.js';
import { sound } from '../audio/engine.js';

const ICON = { info: '💬', ok: '✅', error: '⚠️' };

export function toast(message, kind = 'info', ms = 3200) {
  const host = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast${kind === 'error' ? ' toast--error' : kind === 'ok' ? ' toast--ok' : ''}`;
  el.innerHTML = `<span aria-hidden="true">${ICON[kind] ?? ICON.info}</span><span>${esc(message)}</span>`;
  host.append(el);
  while (host.children.length > 3) host.firstElementChild.remove();
  sound.play(kind === 'error' ? 'error' : kind === 'ok' ? 'success' : 'pop');
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, ms);
}

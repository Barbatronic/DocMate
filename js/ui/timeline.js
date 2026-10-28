// Timeline (panneau de gauche) : un élément par capture, dans l'ordre chronologique. Un clic ouvre
// l'élément dans la vue détaillée ; la légende se modifie aussi sur place.
import { t } from '../core/i18n.js';
import { icon } from '../core/icons.js';
import { on, emit } from '../core/bus.js';
import { $, $$, esc, clockOf, TYPE_ICON } from '../core/dom.js';
import { state, saveEvent, removeEvent, blobUrl, thumbOf } from '../session/session.js';
import { transcribeEvent, isTranscribing } from '../session/transcription.js';

let selectedId = null;
const li = (ev) => $(`#timeline li[data-id="${ev.id}"]`);

export const transcriptSummary = (ev) =>
  `${ev.transcript.length} ${t('tl.phrases')}${ev.transcriptEdited ? ` · ${t('tl.edited')}` : ''}`;

// Narration : bouton « Transcrire », ou début de la transcription. La correction se fait en grand.
function transcriptLine(ev) {
  const busy = isTranscribing(ev);
  const status = `<p class="tl-status" ${busy ? '' : 'hidden'}>${esc(t('tl.transcribing'))}</p>`;
  if (!ev.transcript) {
    return `<div class="tl-tr-row"><button class="btn small tl-transcribe" ${busy ? 'disabled' : ''}>${icon('note')}<span>${esc(t('tl.transcribe'))}</span></button></div>${status}`;
  }
  const all = ev.transcript.map((s) => s.text).join(' ');
  return `<p class="tl-sub">« ${esc(all.length > 90 ? all.slice(0, 90) + '…' : all)} » <span class="hint">· ${esc(transcriptSummary(ev))}</span></p>${status}`;
}

function item(ev) {
  const el = document.createElement('li');
  el.className = `tl-item tl-${ev.type}` + (ev.id === selectedId ? ' selected' : '');
  el.dataset.id = ev.id;
  const dur = ev.tEnd ? ` · ${Math.round((ev.tEnd - ev.t) / 1000)} s` : '';
  const thumbId = thumbOf(ev);
  el.innerHTML = `
    <div class="tl-thumb">${thumbId ? '<img alt="" loading="lazy">' : icon(TYPE_ICON[ev.type])}</div>
    <div class="tl-body">
      <div class="tl-meta"><b>${esc(t('type.' + ev.type))}</b> <time>${clockOf(ev.t)}</time>${dur} <span class="src">${esc(ev.source || '')}</span></div>
      ${ev.type === 'audio' ? transcriptLine(ev) : ''}
      <input class="tl-text" value="${esc(ev.text)}" placeholder="${esc(t('tl.captionPh'))}">
    </div>
    <button class="icon-btn small tl-del" title="${esc(t('tl.delete'))}">${icon('trash')}</button>`;
  if (thumbId) blobUrl(thumbId).then((u) => ($('img', el).src = u));
  el.onclick = (e) => { if (!e.target.closest('input, button, a')) emit('open', ev); };
  $('.tl-transcribe', el)?.addEventListener('click', () => transcribeEvent(ev).catch(() => {}));
  $('.tl-text', el).onchange = (e) => {
    ev.text = e.target.value;
    saveEvent(ev);
  };
  $('.tl-del', el).onclick = () => removeEvent(ev);
  return el;
}

function render() {
  const ol = $('#timeline');
  $('#tl-count').textContent = state.events.length;
  if (!state.events.length) {
    ol.innerHTML = `<li class="tl-empty">${esc(t('tl.empty'))}</li>`;
    return;
  }
  ol.replaceChildren(...state.events.map(item));
}

// Ajoute un seul élément à sa place chronologique, sans reconstruire la liste.
function insert(ev) {
  const ol = $('#timeline');
  $('#tl-count').textContent = state.events.length;
  ol.querySelector('.tl-empty')?.remove();
  const el = item(ev);
  el.classList.add('flash');
  ol.insertBefore(el, ol.children[state.events.indexOf(ev)] || null);
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function remove(ev) {
  li(ev)?.remove();
  if (state.events.length) $('#tl-count').textContent = state.events.length;
  else render();
}

function setStatus({ ev, text, err }) {
  const el = li(ev)?.querySelector('.tl-status');
  if (!el) return;
  el.hidden = false;
  el.textContent = text;
  el.classList.toggle('err', err);
  const btn = li(ev).querySelector('.tl-transcribe');
  if (btn) btn.disabled = !err;
}

export function initTimeline() {
  on('session', render);
  on('event:added', insert);
  on('event:changed', (ev) => li(ev)?.replaceWith(item(ev)));
  on('event:removed', remove);
  on('transcribe:status', setStatus);
  on('detail', (ev) => {
    selectedId = ev?.id ?? null;
    $$('#timeline .tl-item').forEach((x) => x.classList.toggle('selected', x.dataset.id === selectedId));
    if (ev) li(ev)?.scrollIntoView({ block: 'nearest' });
  });
  render();
}

// Liste des sessions (ouvrir, supprimer) et « Nouvelle session ».
import { t } from '../core/i18n.js';
import { icon } from '../core/icons.js';
import { $, esc, toast } from '../core/dom.js';
import { countEvents } from '../core/store.js';
import { state, sessionLabel, sortedSessions, newSession, openSession, deleteSession } from '../session/session.js';
import { finishRecordings } from '../capture/recorder.js';

// Nouvelle session : seulement sur demande. Une session vide sert telle quelle (pas de session vide en plus).
export async function askNewSession() {
  $('#dlg-sessions').close();
  if (!state.events.length) {
    toast(t('session.alreadyEmpty'));
    return $('#session-title').focus();
  }
  if (!confirm(t('session.confirmNew', { name: sessionLabel(state.session) }))) return;
  await finishRecordings();
  await newSession();
  toast(t('session.created'));
  $('#session-title').focus();
}

export async function openSessionsDialog() {
  await renderList();
  $('#dlg-sessions').showModal();
}

async function renderList() {
  let list = await sortedSessions();
  const counts = await Promise.all(list.map((s) => countEvents(s.id)));
  const n = Object.fromEntries(list.map((s, i) => [s.id, counts[i]]));
  // Sessions vides et sans nom (restes de l'ancien fonctionnement) : supprimées sans bruit.
  const empty = list.filter((s) => !n[s.id] && !s.title && s.id !== state.session?.id);
  for (const s of empty) await deleteSession(s.id);
  list = list.filter((s) => !empty.includes(s));

  const ul = $('#sessions-list');
  ul.innerHTML = '';
  for (const s of list) {
    const current = s.id === state.session?.id;
    const li = document.createElement('li');
    li.classList.toggle('current', current);
    li.innerHTML = `<div class="sess-info"><b>${esc(sessionLabel(s))}</b>${current ? ` <span class="pill ok">${esc(t('session.current'))}</span>` : ''}
        <span class="hint">${esc(new Date(s.used || s.started).toLocaleString())} · ${n[s.id]} ${esc(t('session.items'))}</span></div>
      <div class="row">${current ? '' : `<button class="btn small" data-a="open">${icon('open')}<span>${esc(t('session.open'))}</span></button>`}
        <button class="icon-btn small" data-a="del" title="${esc(t('session.delete'))}">${icon('trash')}</button></div>`;
    li.onclick = async (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'open') {
        await finishRecordings();
        await openSession(s.id);
        $('#dlg-sessions').close();
      } else if (a === 'del' && confirm(t('session.confirmDelete', { name: sessionLabel(s) }))) {
        if (current) await finishRecordings();
        await deleteSession(s.id);
        await renderList();
      }
    };
    ul.append(li);
  }
}

export function initSessionsDialog() {
  $('#btn-new-2').onclick = askNewSession;
}

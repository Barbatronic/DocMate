// Barre d'outils, raccourcis clavier, nom de la session, chrono et barre d'état.
import { t } from '../core/i18n.js';
import { on } from '../core/bus.js';
import { $, hhmmss } from '../core/dom.js';
import { state, defaultTitle, updateSession } from '../session/session.js';
import { addTile, photo, clip, clipping } from '../capture/cameras.js';
import { narrator, narrate, screenshot, addMarker, addNote, recording, workMs } from '../capture/recorder.js';
import { micSource } from '../capture/mic.js';
import { phonesConnected } from '../phone/remote.js';
import { askNewSession, openSessionsDialog } from './sessions-dialog.js';
import { pip } from './pip.js';

const TL_KEY = 'docmate.tlCollapsed';

function renderStatus() {
  const rec = recording();
  $('#btn-clip').classList.toggle('rec', clipping());
  $('#btn-narrate').classList.toggle('rec', narrator.active);
  $('#st-dot').className = 'dot ' + (rec ? 'rec' : 'ok');
  $('#st-session').textContent = t(rec ? 'st.rec' : 'st.ready');
  $('#st-mic').textContent = t(micSource() === 'phone' ? 'st.micPhone' : 'st.micPc');
  $('#st-phone').textContent = phonesConnected() ? t('st.phoneN', { n: phonesConnected() }) : t('st.phoneNone');
}

function renderTitle() {
  const input = $('#session-title');
  input.value = state.session?.title || '';
  input.placeholder = state.session ? defaultTitle(state.session) : '';
}

function setTlCollapsed(collapsed) {
  $('#main').classList.toggle('left-collapsed', collapsed);
  try { localStorage.setItem(TL_KEY, collapsed ? '1' : ''); } catch { /* sans stockage */ }
}

export function initToolbar() {
  // Boutons.
  $('#btn-session').onclick = askNewSession;
  $('#btn-sessions').onclick = openSessionsDialog;
  $('#btn-narrate').onclick = narrate;
  $('#btn-photo').onclick = photo;
  $('#btn-clip').onclick = clip;
  $('#btn-marker').onclick = () => addMarker();
  $('#btn-screen').onclick = screenshot;
  $('#btn-pip').onclick = () => pip.open();
  $('#btn-add-cam').onclick = $('#btn-add-cam-2').onclick = () => addTile();

  // Nom de la session, modifiable sur place.
  $('#session-title').onchange = (e) => updateSession({ title: e.target.value.trim() });
  $('#session-title').onkeydown = (e) => e.key === 'Enter' && e.target.blur();

  // Note écrite (panneau de la timeline).
  $('#note-form').onsubmit = async (e) => {
    e.preventDefault();
    const text = $('#note-input').value.trim();
    if (!text) return;
    $('#note-input').value = '';
    await addNote(text);
  };

  // Raccourcis (hors champs de saisie et dialogues).
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input, textarea, select, dialog[open], [contenteditable]')) return;
    const act = { p: photo, v: clip, m: () => addMarker(), n: narrate, s: screenshot }[e.key.toLowerCase()];
    if (act) {
      e.preventDefault();
      act();
    }
  });

  // Languette de la timeline (écran large) : replie le panneau ; l'état est gardé.
  setTlCollapsed(localStorage.getItem(TL_KEY) === '1');
  $('#btn-tl-toggle').onclick = () => setTlCollapsed(!$('#main').classList.contains('left-collapsed'));

  // Hauteur de la barre flottante : la zone des caméras et la timeline commencent dessous.
  new ResizeObserver(() => $('#main').style.setProperty('--vp-inset-t', `${$('#topbar').offsetHeight + 8}px`)).observe($('#topbar'));

  // Chrono : temps de travail de la session.
  setInterval(() => ($('#session-timer').textContent = hhmmss(workMs())), 500);

  on('status', () => {
    renderStatus();
    // Titre changé ailleurs (dialogue de génération) ; jamais pendant qu'on le tape.
    if (document.activeElement !== $('#session-title')) renderTitle();
  });
  on('session', () => { renderTitle(); renderStatus(); });
  on('level', (lvl) => $('#btn-narrate .level i').style.setProperty('--lvl', lvl));
}

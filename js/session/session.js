// Session courante et ses éléments (la timeline). Seule source de vérité : chaque changement est
// annoncé sur le bus (session, event:added, event:changed, event:removed).
//
// Il y a toujours une session courante, retrouvée à chaque ouverture de la page. On n'en change que
// sur demande : « Nouvelle » ou « Ouvrir » (liste des sessions). Les enregistrements en cours doivent
// être terminés avant (voir capture/recorder.js › finishRecordings).
import * as db from '../core/store.js';
import { emit } from '../core/bus.js';
import { t } from '../core/i18n.js';
import { videoThumb } from '../capture/media.js';

const CURRENT_KEY = 'docmate.current';

export const state = {
  session: null, // toujours une session après loadCurrent()
  events: [], // éléments de la session, triés par heure
};

export const defaultTitle = (s) => t('session.untitled', { date: new Date(s.started).toLocaleDateString() });
export const sessionLabel = (s) => (s ? s.title || defaultTitle(s) : '');

export const sortedSessions = async () =>
  (await db.listSessions()).sort((a, b) => (b.used || b.started) - (a.used || a.started));

async function setCurrent(s, { isNew = false } = {}) {
  revokeUrls();
  state.session = s;
  s.used = Date.now();
  await db.putSession(s);
  state.events = isNew ? [] : await db.listEvents(s.id);
  localStorage.setItem(CURRENT_KEY, s.id);
  emit('session');
}

export const newSession = () =>
  setCurrent({ id: db.uid('s'), started: Date.now(), title: '', project: '', instructions: '' }, { isNew: true });

export async function openSession(id) {
  if (state.session?.id !== id) await setCurrent(await db.getSession(id));
}

// Au démarrage : la dernière session utilisée, sinon la plus récente, sinon une nouvelle.
export async function loadCurrent() {
  const id = localStorage.getItem(CURRENT_KEY) || localStorage.getItem('docmate.active');
  localStorage.removeItem('docmate.active'); // ancienne clé (sessions démarrées / terminées)
  const s = (id && (await db.getSession(id))) || (await sortedSessions())[0];
  if (s) await setCurrent(s);
  else await newSession();
}

// Supprime une session ; si c'était la courante, on passe à la plus récente qui reste.
export async function deleteSession(id) {
  await db.deleteSession(id);
  if (state.session?.id === id) {
    state.session = null;
    localStorage.removeItem(CURRENT_KEY);
    await loadCurrent();
  }
}

// Champs de la session (titre, projet, consignes pour l'IA).
export async function updateSession(fields) {
  Object.assign(state.session, fields);
  await db.putSession(state.session);
  emit('status');
}

// ---------- Éléments ----------
// Point d'entrée de toutes les captures : caméras, narration, écran, téléphone, fichiers.
export async function addEvent(meta, { blob, keyframes, thumb } = {}) {
  if (!state.session) await loadCurrent();
  const ev = { id: db.uid(meta.type.slice(0, 2)), sessionId: state.session.id, text: '', ...meta };
  if (blob) ev.blobId = await db.putBlob(blob);
  if (keyframes?.length) ev.keyframes = await Promise.all(keyframes.filter(Boolean).map((k) => db.putBlob(k)));
  if ((ev.type === 'clip' || ev.type === 'phone_video') && !ev.keyframes?.length) {
    thumb ||= await videoThumb(blob);
    if (thumb) ev.thumbId = await db.putBlob(thumb);
  }
  await db.putEvent(ev);
  // La session a pu changer pendant l'enregistrement des fichiers : l'élément reste dans la sienne.
  if (ev.sessionId === state.session.id) {
    state.events.push(ev);
    state.events.sort((a, b) => a.t - b.t);
    emit('event:added', ev);
  }
  return ev;
}

export async function saveEvent(ev) {
  await db.putEvent(ev);
  emit('event:changed', ev);
}

export async function removeEvent(ev) {
  await db.deleteEvent(ev);
  revokeUrls([ev.blobId, ev.thumbId, ...(ev.keyframes || [])].filter(Boolean));
  state.events = state.events.filter((x) => x !== ev);
  emit('event:removed', ev);
}

// Segment de narration reconstitué au démarrage (onglet fermé pendant l'enregistrement).
export async function addRecoveredAudio({ sessionId, t: t0, tEnd, mime, blob }) {
  if (!(await db.getSession(sessionId))) return false;
  const blobId = await db.putBlob(blob);
  await db.putEvent({ id: db.uid('au'), sessionId, type: 'audio', t: t0, tEnd, mime, source: 'micro', text: '', blobId });
  return true;
}

// ---------- Fichiers des éléments (URL d'objets) ----------
const urls = new Map(); // blobId -> Promise<object URL>

export function blobUrl(id) {
  if (!id) return Promise.resolve('');
  if (!urls.has(id)) urls.set(id, db.getBlob(id).then((b) => (b ? URL.createObjectURL(b) : '')));
  return urls.get(id);
}

// Libère les URL (toutes, ou celles des blobs donnés) : sinon les fichiers restent en mémoire.
export function revokeUrls(ids = [...urls.keys()]) {
  for (const id of ids) {
    urls.get(id)?.then((u) => u && URL.revokeObjectURL(u));
    urls.delete(id);
  }
}

// Image représentant un élément (photo, ou image clé / vignette d'une vidéo).
export const thumbOf = (ev) => (ev.type.includes('photo') || ev.type === 'screenshot' ? ev.blobId : ev.keyframes?.[0] || ev.thumbId);

// Actions de capture hors caméras (narration, capture d'écran, repère) et état d'enregistrement
// commun : utilisé par la barre d'outils, les raccourcis, la barre flottante et la télécommande.
import { t } from '../core/i18n.js';
import { on, emit } from '../core/bus.js';
import { toast } from '../core/dom.js';
import { getHandle, putHandle } from '../core/store.js';
import { state, addEvent, addRecoveredAudio } from '../session/session.js';
import { workTime } from '../output/export.js';
import { Narrator, recoverNarration } from './narrator.js';
import { ScreenWatcher, ScreenShare } from './screen.js';
import { releaseMic, setRemoteMic, micSource } from './mic.js';
import { clipping, stopClips } from './cameras.js';

export const narrator = new Narrator(addEvent, (lvl) => emit('level', lvl), () => state.session?.id);
export const share = new ScreenShare(addEvent);
const watcher = new ScreenWatcher(addEvent);

export const recording = () => narrator.active || clipping();

export async function narrate() {
  try {
    if (narrator.active) await narrator.stop();
    else await narrator.start();
  } catch (e) {
    toast(`${t('err.mic')} ${e.message}`, 6000);
  }
  emit('status');
}

export async function screenshot() {
  try {
    await share.capture();
  } catch (e) {
    if (e.name !== 'NotAllowedError') toast(e.message);
  }
}

export async function addMarker(text = '') {
  await addEvent({ type: 'marker', t: Date.now(), text });
  toast(`📍 ${t('type.marker')}`, 1500);
}

export const addNote = (text) => addEvent({ type: 'note', t: Date.now(), text });

// Avant de changer de session : les derniers segments (narration, clips) arrivent après l'arrêt des
// enregistreurs, on les attend pour qu'ils rejoignent la session qu'on quitte.
export async function finishRecordings() {
  await Promise.all([narrator.stop(), stopClips()]);
  emit('status');
}

// Micro sans fil du téléphone branché ou débranché : la narration en cours change de source
// (un nouveau segment commence).
export async function switchMic(stream) {
  const was = micSource();
  setRemoteMic(stream);
  if (micSource() === was) return;
  toast(t(stream ? 'mic.phoneOn' : 'mic.phoneOff'));
  if (narrator.active) {
    await narrator.stop();
    try {
      await narrator.start();
    } catch (e) {
      toast(`${t('err.mic')} ${e.message}`, 6000);
    }
  }
  emit('status');
}

// ---------- Temps de travail (chrono) ----------
// Enregistrement en cours compris ; les pauses de plus de 30 min ne comptent pas.
let recSince = null;
export const workMs = () => workTime(recSince ? [...state.events, { t: recSince, tEnd: Date.now() }] : state.events);

// ---------- Dossier de captures surveillé ----------
// Indépendant de la session : chaque nouvelle capture va dans la session courante.
let shotsHandle = null;
export const shotsFolder = () => shotsHandle?.name || '';

async function startShotWatch() {
  if (!shotsHandle) return;
  try {
    if ((await shotsHandle.queryPermission({ mode: 'read' })) !== 'granted' &&
        (await shotsHandle.requestPermission({ mode: 'read' })) !== 'granted') return;
    await watcher.watch(shotsHandle, Date.now());
  } catch (e) {
    console.warn(e);
  }
}

export async function pickShotsFolder() {
  try {
    shotsHandle = await window.showDirectoryPicker({ id: 'docmate-shots', mode: 'read', startIn: 'pictures' });
    await putHandle('shots', shotsHandle);
    await startShotWatch();
  } catch { /* annulé */ }
}

export function initRecorder() {
  // Suivi de l'enregistrement : chrono, et micro du PC coupé quand plus rien ne l'utilise.
  on('status', () => {
    const rec = recording();
    if (rec && !recSince) recSince = Date.now();
    if (!rec) recSince = null;
    if (!narrator.active && !clipping()) releaseMic();
  });
  addEventListener('beforeunload', (e) => {
    if (recording()) e.preventDefault();
  });
}

// Au démarrage, avant d'ouvrir la session : narration interrompue (onglet fermé ou planté)
// rattachée à sa session, et reprise de la surveillance du dossier de captures.
export async function bootRecorder() {
  try {
    const n = await recoverNarration(addRecoveredAudio);
    if (n) toast(t('rec.recovered', { n }), 8000);
  } catch (e) {
    console.warn('Récupération de la narration impossible', e);
  }
  try {
    shotsHandle = (await getHandle('shots')) || null;
  } catch { /* pas de poignée */ }
  await startShotWatch();
}

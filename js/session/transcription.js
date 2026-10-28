// Transcription des narrations : une seule transcription par segment à la fois, qu'elle vienne du
// bouton « Transcrire », de l'option automatique ou de la génération de la doc.
// La progression est annoncée sur le bus (transcribe:status), le résultat par event:changed.
import { S } from '../core/settings.js';
import { t } from '../core/i18n.js';
import { on, emit } from '../core/bus.js';
import { toast } from '../core/dom.js';
import { getBlob } from '../core/store.js';
import { transcribe } from '../ai/transcribe.js';
import { state, saveEvent } from './session.js';

const running = new Map(); // ev.id -> Promise

export const isTranscribing = (ev) => running.has(ev.id);

export function transcribeEvent(ev, onProgress) {
  if (S.transcription.provider === 'none') {
    toast(t('tl.sttOff'), 6000);
    return Promise.resolve();
  }
  if (!running.has(ev.id)) {
    const status = (text, err = false) => emit('transcribe:status', { ev, text, err });
    const job = (async () => {
      try {
        ev.transcript = await transcribe(await getBlob(ev.blobId), (p) => { status(p); onProgress?.(p); });
        ev.transcriptEdited = false;
        running.delete(ev.id);
        await saveEvent(ev);
      } catch (e) {
        running.delete(ev.id);
        emit('event:changed', ev);
        status(`⚠ ${e.message || e}`, true);
        throw e;
      }
    })();
    running.set(ev.id, job);
    emit('event:changed', ev); // l'élément s'affiche « en cours de transcription »
  }
  return running.get(ev.id);
}

// Toutes les narrations de la session pas encore transcrites (avant la génération de la doc).
// API : plusieurs segments à la fois ; Whisper local : un seul (un seul worker, le calcul sature déjà).
export async function transcribeAll({ onSegment, onProgress } = {}) {
  const audio = state.events.filter((e) => e.type === 'audio');
  const todo = audio.filter((e) => !e.transcript);
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const ev = todo[next++];
      onSegment?.(audio.indexOf(ev) + 1, audio.length);
      await transcribeEvent(ev, onProgress);
    }
  };
  const n = S.transcription.provider === 'local' ? 1 : 3;
  await Promise.all(Array.from({ length: Math.min(n, todo.length) }, worker));
}

// Option « transcrire automatiquement » : chaque segment dès la fin de la narration.
export function initAutoTranscription() {
  on('event:added', (ev) => {
    if (ev.type === 'audio' && S.transcription.auto && S.transcription.provider !== 'none') {
      transcribeEvent(ev).catch(() => { /* affiché sur l'élément */ });
    }
  });
}

// Narration continue : enregistrement du micro, jauge de niveau, reprise après plantage.
import { pickMime, AUDIO_MIMES } from '../core/features.js';
import { putBlob, listBlobKeys, getBlob, deleteBlobs } from '../core/store.js';
import { getMic } from './mic.js';

// Enregistre en continu, découpé en segments de 10 min (limite de taille des API de transcription).
// Chaque morceau de 5 s est aussi écrit dans IndexedDB : un rechargement ou un plantage de l'onglet
// ne perd pas le segment en cours (voir recoverNarration).
const SEGMENT_MS = 10 * 60 * 1000;
const CHUNK_MS = 5000;
const PENDING_KEY = 'docmate.pendingAudio';

const pendingAll = () => { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '{}'); } catch { return {}; } };
const pendingSet = (id, v) => {
  const all = pendingAll();
  if (v) all[id] = v; else delete all[id];
  localStorage.setItem(PENDING_KEY, JSON.stringify(all));
};
const chunkKey = (segId, i) => `${segId}-${String(i).padStart(5, '0')}`;

export class Narrator {
  constructor(sink, onLevel, sessionId) {
    this.sink = sink;
    this.onLevel = onLevel;
    this.sessionId = sessionId; // () => id de la session courante
    this.active = false;
    this.done = Promise.resolve();
  }

  async start() {
    if (this.active) return;
    this.stream = await getMic();
    this.active = true;
    this.meter();
    this.segment();
  }

  segment() {
    const mime = pickMime(AUDIO_MIMES);
    const rec = new MediaRecorder(this.stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : {});
    const chunks = [];
    const t0 = Date.now();
    const segId = 'pa' + t0.toString(36);
    const type = (rec.mimeType || 'audio/webm').split(';')[0];
    let writes = Promise.resolve();
    pendingSet(segId, { sessionId: this.sessionId(), t0, mime: type });
    rec.ondataavailable = (e) => {
      if (!e.data.size) return;
      const i = chunks.push(e.data) - 1;
      writes = writes.then(() => putBlob(e.data, chunkKey(segId, i))).catch(() => {});
    };
    // Le segment précédent (rotation) peut encore être en cours d'enregistrement : on attend les deux.
    this.done = Promise.all([this.done, new Promise((resolve) => {
      rec.onstop = async () => {
        try {
          const blob = new Blob(chunks, { type });
          if (blob.size > 2000) await this.sink({ type: 'audio', t: t0, tEnd: Date.now(), mime: type, source: 'micro' }, { blob });
          pendingSet(segId, null);
          await writes;
          await deleteBlobs(segId + '-');
        } finally {
          resolve();
        }
      };
    })]);
    rec.start(CHUNK_MS);
    this.rec = rec;
    this.rotate = setTimeout(() => { rec.stop(); if (this.active) this.segment(); }, SEGMENT_MS);
  }

  // Résolue quand le dernier segment est enregistré dans la session.
  async stop() {
    if (!this.active) return;
    this.active = false;
    clearTimeout(this.rotate);
    if (this.rec && this.rec.state !== 'inactive') this.rec.stop();
    cancelAnimationFrame(this.raf);
    this.ctx?.close();
    this.onLevel?.(0);
    await this.done;
  }

  meter() {
    this.ctx = new AudioContext();
    const an = this.ctx.createAnalyser();
    an.fftSize = 512;
    this.ctx.createMediaStreamSource(this.stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    const loop = () => {
      an.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      this.onLevel?.(peak / 128);
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }
}

// Segments de narration interrompus (onglet fermé ou planté) : reconstitués à partir des morceaux,
// remis à `save({sessionId, t, tEnd, mime, blob})` (vrai s'il a été gardé), puis effacés.
export async function recoverNarration(save) {
  let n = 0;
  for (const [segId, p] of Object.entries(pendingAll())) {
    const keys = await listBlobKeys(segId + '-');
    // Morceau récent : le segment est sans doute encore enregistré par un autre onglet.
    if (p.t0 + keys.length * CHUNK_MS > Date.now() - 3 * CHUNK_MS) continue;
    const parts = (await Promise.all(keys.map(getBlob))).filter(Boolean);
    const blob = new Blob(parts, { type: p.mime });
    if (p.sessionId && blob.size > 2000) {
      if (await save({ sessionId: p.sessionId, t: p.t0, tEnd: p.t0 + parts.length * CHUNK_MS, mime: p.mime, blob })) n++;
    }
    pendingSet(segId, null);
    await deleteBlobs(segId + '-');
  }
  return n;
}

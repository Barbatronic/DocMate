// Capture : tuiles caméra (photo, clip), narration continue, captures d'écran.
// Chaque capture est remise à `sink(event, blobs)` avec son horodatage.
import { F, pickMime, VIDEO_MIMES, AUDIO_MIMES } from './features.js';
import { S } from './settings.js';

const extOf = (mime) => (mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : mime.includes('png') ? 'png' : mime.includes('jpeg') ? 'jpg' : 'webm');
export { extOf };

// Image d'une vidéo en cours, au format JPEG, côté max `maxPx` (0 = pleine résolution).
export async function grabFrame(video, maxPx = 0, quality = 0.92) {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) throw new Error('flux vidéo vide');
  const k = maxPx ? Math.min(1, maxPx / Math.max(w, h)) : 1;
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
}

// Réduit une image (Blob) pour l'IA ou le web. Retourne le blob d'origine s'il est déjà assez petit.
export async function shrink(blob, maxPx, type = 'image/jpeg', quality = 0.85) {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
  if (k === 1 && blob.type === type) return blob;
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return new Promise((r) => c.toBlob(r, type, quality));
}

// Première image utile d'un fichier vidéo (vignette).
export function videoThumb(blob, at = 0.5) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.src = URL.createObjectURL(blob);
    const done = (b) => { URL.revokeObjectURL(v.src); resolve(b); };
    v.onloadeddata = () => { v.currentTime = Math.min(at, (v.duration || 1) / 2); };
    v.onseeked = async () => done(await grabFrame(v, 640, 0.8).catch(() => null));
    v.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
  });
}

// ---------- Micro partagé (narration + son des clips) ----------
let micStream = null;
export async function getMic() {
  if (micStream?.active) return micStream;
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: S.capture.micId ? { deviceId: { exact: S.capture.micId } } : true,
  });
  return micStream;
}

// ---------- Tuile caméra ----------
export class CameraTile {
  constructor({ container, sink, deviceId = '', remote = null, label = '', onClose }) {
    this.sink = sink;
    this.deviceId = deviceId;
    this.remote = remote; // MediaStream distant (téléphone)
    this.onClose = onClose;
    this.el = document.createElement('div');
    this.el.className = 'cam';
    this.el.innerHTML = `
      <video autoplay muted playsinline></video>
      <div class="cam-bar">
        <select class="cam-select" title="Caméra"></select>
        <span class="cam-label"></span>
        <span class="rec-dot" hidden>● REC <b class="rec-time">0:00</b></span>
        <button class="btn icon cam-photo" title="Photo (P)">📸</button>
        <button class="btn icon cam-clip" title="Clip vidéo (V)">⏺</button>
        <button class="btn icon ghost cam-close" title="Fermer">✕</button>
      </div>`;
    this.video = this.el.querySelector('video');
    this.select = this.el.querySelector('.cam-select');
    this.el.querySelector('.cam-photo').onclick = () => this.photo();
    this.el.querySelector('.cam-clip').onclick = () => this.toggleClip();
    this.el.querySelector('.cam-close').onclick = () => this.close();
    this.el.addEventListener('click', () => this.el.parentElement?.querySelectorAll('.cam').forEach((c) => c.classList.toggle('active', c === this.el)));
    if (remote) {
      this.select.hidden = true;
      this.el.querySelector('.cam-label').textContent = label || '📱';
      this.label = label || 'téléphone';
      this.setStream(remote);
    } else {
      this.select.onchange = () => this.open(this.select.value);
    }
    container.append(this.el);
  }

  async fillDevices(devices) {
    if (this.remote) return;
    this.select.innerHTML = devices.map((d, i) => `<option value="${d.deviceId}">${d.label || 'Caméra ' + (i + 1)}</option>`).join('');
    if (this.deviceId) this.select.value = this.deviceId;
  }

  async open(deviceId) {
    this.stream?.getTracks().forEach((t) => t.stop());
    const video = { width: { ideal: S.capture.width }, height: { ideal: S.capture.height } };
    if (deviceId) video.deviceId = { exact: deviceId };
    const stream = await navigator.mediaDevices.getUserMedia({ video });
    this.deviceId = stream.getVideoTracks()[0].getSettings().deviceId || deviceId;
    this.label = stream.getVideoTracks()[0].label || 'caméra';
    this.select.value = this.deviceId;
    this.setStream(stream);
    this.el.dispatchEvent(new CustomEvent('camchange', { bubbles: true }));
  }

  setStream(stream) {
    this.stream = stream;
    this.video.srcObject = stream;
  }

  async photo() {
    let blob;
    const track = this.stream?.getVideoTracks()[0];
    // ImageCapture donne la pleine résolution du capteur quand le navigateur la propose.
    if (track && 'ImageCapture' in window && !this.remote) {
      try { blob = await new ImageCapture(track).takePhoto(); } catch { blob = null; }
    }
    blob ||= await grabFrame(this.video);
    this.flash();
    await this.sink({ type: 'photo', t: Date.now(), source: this.label, mime: blob.type || 'image/jpeg' }, { blob });
  }

  flash() {
    this.el.classList.remove('flash');
    void this.el.offsetWidth;
    this.el.classList.add('flash');
  }

  get recording() { return !!this.rec; }

  async toggleClip() {
    if (this.rec) return this.stopClip();
    const tracks = [...this.stream.getVideoTracks()];
    if (S.capture.clipAudio) {
      try { tracks.push(...(await getMic()).getAudioTracks()); } catch { /* clip muet */ }
    }
    const mime = pickMime(VIDEO_MIMES);
    const rec = new MediaRecorder(new MediaStream(tracks), mime ? { mimeType: mime, videoBitsPerSecond: 6e6 } : {});
    const chunks = [];
    const keyframes = [];
    const t0 = Date.now();
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const grabKey = async () => { if (keyframes.length < 6) keyframes.push(await grabFrame(this.video, 960, 0.8)); };
    grabKey();
    const kfTimer = setInterval(grabKey, 4000);
    const dot = this.el.querySelector('.rec-dot');
    const tick = setInterval(() => {
      const s = Math.round((Date.now() - t0) / 1000);
      dot.querySelector('.rec-time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }, 500);
    this.rec = { rec, stopped: new Promise((resolve) => (rec.onstop = resolve)), cleanup: () => { clearInterval(kfTimer); clearInterval(tick); } };
    rec.start(1000);
    dot.hidden = false;
    this.el.classList.add('recording');
    this.rec.finish = async () => {
      await this.rec.stopped;
      this.rec.cleanup();
      const blob = new Blob(chunks, { type: (rec.mimeType || 'video/webm').split(';')[0] });
      dot.hidden = true;
      this.el.classList.remove('recording');
      this.rec = null;
      await this.sink({ type: 'clip', t: t0, tEnd: Date.now(), source: this.label, mime: blob.type }, { blob, keyframes });
    };
  }

  async stopClip() {
    if (!this.rec) return;
    this.rec.rec.stop();
    await this.rec.finish();
  }

  async close() {
    await this.stopClip();
    if (!this.remote) this.stream?.getTracks().forEach((t) => t.stop());
    this.el.remove();
    this.onClose?.(this);
  }
}

// ---------- Narration ----------
// Enregistre en continu, découpé en segments de 10 min (limite de taille des API de transcription).
const SEGMENT_MS = 10 * 60 * 1000;

export class Narrator {
  constructor(sink, onLevel) {
    this.sink = sink;
    this.onLevel = onLevel;
    this.active = false;
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
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: (rec.mimeType || 'audio/webm').split(';')[0] });
      if (blob.size > 2000) this.sink({ type: 'audio', t: t0, tEnd: Date.now(), mime: blob.type, source: 'micro' }, { blob });
    };
    rec.start(5000);
    this.rec = rec;
    this.rotate = setTimeout(() => { rec.stop(); if (this.active) this.segment(); }, SEGMENT_MS);
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    clearTimeout(this.rotate);
    this.rec?.state !== 'inactive' && this.rec.stop();
    cancelAnimationFrame(this.raf);
    this.ctx?.close();
    this.onLevel?.(0);
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

// ---------- Captures d'écran ----------
// 1. Dossier surveillé (Chromium) : les captures natives de l'OS y arrivent et sont importées.
// 2. Partage d'écran : bouton « Capture » qui prend une image de l'écran partagé.
// 3. Glisser-déposer : partout.
export class ScreenWatcher {
  constructor(sink) {
    this.sink = sink;
    this.seen = new Set();
    this.dir = null;
  }

  async watch(dirHandle, since) {
    this.dir = dirHandle;
    this.since = since;
    // On ignore ce qui existait déjà.
    for await (const [name, h] of dirHandle.entries()) if (h.kind === 'file') this.seen.add(name);
    clearInterval(this.timer);
    this.timer = setInterval(() => this.poll(), 1500);
  }

  stop() { clearInterval(this.timer); this.dir = null; }

  async poll() {
    if (!this.dir || this.busy) return;
    this.busy = true;
    try {
      for await (const [name, h] of this.dir.entries()) {
        if (h.kind !== 'file' || this.seen.has(name) || !/\.(png|jpe?g|webp|webm|mp4)$/i.test(name)) continue;
        const file = await h.getFile();
        // Attendre la fin d'écriture : taille stable entre deux passages.
        if (!file.size || this.pending?.[name] !== file.size) { (this.pending ||= {})[name] = file.size; continue; }
        this.seen.add(name);
        const video = file.type.startsWith('video');
        await this.sink({ type: video ? 'clip' : 'screenshot', t: file.lastModified, source: 'écran', mime: file.type, name }, { blob: file });
      }
    } catch (e) {
      console.warn('Surveillance du dossier interrompue', e);
    } finally {
      this.busy = false;
    }
  }
}

export class ScreenShare {
  constructor(sink) { this.sink = sink; this.stream = null; this.video = document.createElement('video'); this.video.muted = true; }
  get active() { return !!this.stream?.active; }
  async start() {
    this.stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
    this.video.srcObject = this.stream;
    await this.video.play();
  }
  async capture() {
    if (!this.active) await this.start();
    await new Promise((r) => setTimeout(r, 150));
    const blob = await grabFrame(this.video, 0, 0.95);
    await this.sink({ type: 'screenshot', t: Date.now(), source: 'écran partagé', mime: 'image/jpeg' }, { blob });
  }
  stop() { this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null; }
}

export function importFiles(files, sink) {
  return Promise.all([...files].map((f) => {
    const type = f.type.startsWith('video') ? 'clip' : f.type.startsWith('image') ? 'screenshot' : f.type.startsWith('audio') ? 'audio' : null;
    if (!type) return null;
    return sink({ type, t: f.lastModified || Date.now(), source: 'fichier', mime: f.type, name: f.name }, { blob: f });
  }));
}

export { F };

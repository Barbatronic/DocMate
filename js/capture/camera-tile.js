// Tuile caméra : aperçu, photo pleine résolution, clip vidéo (avec images clés pour l'IA), cadrage PTZ.
// Chaque capture est remise à `sink(meta, {blob, keyframes})`.
import { pickMime, VIDEO_MIMES } from '../core/features.js';
import { S } from '../core/settings.js';
import { icon } from '../core/icons.js';
import { esc } from '../core/dom.js';
import { grabFrame } from './media.js';
import { getMic } from './mic.js';
import { Ptz, ptzCaps, ptzRequest } from './ptz.js';

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
        <span class="spacer"></span>
        <button class="icon-btn cam-ptz" title="Cadrage (PTZ)" aria-pressed="false" hidden>${icon('ptz')}</button>
        <button class="icon-btn cam-photo" title="Photo (P)">${icon('photo')}</button>
        <button class="icon-btn cam-clip" title="Clip vidéo (V)">${icon('clip')}</button>
        <button class="icon-btn cam-close" title="Fermer">${icon('close')}</button>
      </div>`;
    this.video = this.el.querySelector('video');
    this.select = this.el.querySelector('.cam-select');
    this.el.querySelector('.cam-photo').onclick = () => this.photo();
    this.el.querySelector('.cam-clip').onclick = () => this.toggleClip();
    this.el.querySelector('.cam-close').onclick = () => this.close();
    this.ptzBtn = this.el.querySelector('.cam-ptz');
    this.ptzBtn.onclick = (e) => {
      e.stopPropagation();
      this.ptzBtn.setAttribute('aria-pressed', String(this.ptz?.toggle() ?? false));
    };
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
    this.select.innerHTML = devices.map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || 'Caméra ' + (i + 1))}</option>`).join('');
    if (this.deviceId) this.select.value = this.deviceId;
  }

  async open(deviceId) {
    this.stream?.getTracks().forEach((t) => t.stop());
    // ptzRequest : accès au cadrage (pan, tilt, zoom) des caméras qui le proposent.
    const video = { width: { ideal: S.capture.width }, height: { ideal: S.capture.height }, ...ptzRequest() };
    if (deviceId) video.deviceId = { exact: deviceId };
    const stream = await navigator.mediaDevices.getUserMedia({ video });
    this.deviceId = stream.getVideoTracks()[0].getSettings().deviceId || deviceId;
    this.label = stream.getVideoTracks()[0].label || 'caméra';
    this.select.value = this.deviceId;
    this.setStream(stream);
    this.setupPtz(stream.getVideoTracks()[0]);
    this.el.dispatchEvent(new CustomEvent('camchange', { bubbles: true }));
  }

  setStream(stream) {
    this.stream = stream;
    this.video.srcObject = stream;
  }

  // Bouton et panneau de cadrage, seulement si la caméra se pilote.
  setupPtz(track) {
    this.ptz?.destroy();
    const caps = ptzCaps(track);
    this.ptz = caps ? new Ptz(this.el, track, this.deviceId, caps) : null;
    this.ptzBtn.hidden = !caps;
    this.ptzBtn.setAttribute('aria-pressed', 'false');
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
    this.el.dispatchEvent(new CustomEvent('recchange', { bubbles: true }));
    this.rec.finish = async () => {
      await this.rec.stopped;
      this.rec.cleanup();
      const blob = new Blob(chunks, { type: (rec.mimeType || 'video/webm').split(';')[0] });
      dot.hidden = true;
      this.el.classList.remove('recording');
      this.rec = null;
      await this.sink({ type: 'clip', t: t0, tEnd: Date.now(), source: this.label, mime: blob.type }, { blob, keyframes });
      this.el.dispatchEvent(new CustomEvent('recchange', { bubbles: true }));
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

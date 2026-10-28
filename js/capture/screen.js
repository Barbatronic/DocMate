// Captures d'écran :
// 1. Dossier surveillé (Chromium) : les captures natives de l'OS y arrivent et sont importées.
// 2. Partage d'écran : bouton « Capture » qui prend une image de l'écran partagé.
// 3. Glisser-déposer et coller : voir import.js.
import { grabFrame } from './media.js';

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

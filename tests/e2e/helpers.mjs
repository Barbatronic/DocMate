// Outils communs aux parcours : moteurs et appareils simulés, raccourcis d'actions.
import { expect } from '@playwright/test';

// Whisper simulé : réponse rapide et prévisible (deux phrases horodatées).
const WHISPER_STUB = `self.onmessage = async ({ data }) => {
  for (const p of [10, 100]) { self.postMessage({ progress: 'Modèle onnx/encoder.onnx ' + p + ' %' }); await new Promise((r) => setTimeout(r, 100)); }
  self.postMessage({ progress: 'Transcription locale (processeur)…' });
  await new Promise((r) => setTimeout(r, 300));
  self.postMessage({ segments: [
    { start: 0, end: 1.2, text: 'Là je serre les vis M3 au couple.' },
    { start: 1.2, end: 2.5, text: "J'utilise une clé Allen de 2,5." } ] });
};`;

export async function stubWhisper(page, body = WHISPER_STUB) {
  await page.route('**/whisper-worker.js*', (r) => r.fulfill({ body, contentType: 'text/javascript' }));
}

// Réglages de départ (seulement au premier chargement : un rechargement garde ceux de la page).
export async function initialSettings(page, settings) {
  await page.addInitScript((s) => {
    if (!localStorage.getItem('docmate.settings')) localStorage.setItem('docmate.settings', JSON.stringify(s));
  }, settings);
}

// Caméra pilotable simulée (valeurs typiques d'une webcam UVC PTZ).
export async function fakePtzCamera(page) {
  await page.addInitScript(() => {
    const P = MediaStreamTrack.prototype;
    const caps0 = P.getCapabilities;
    const set0 = P.getSettings;
    const state = new WeakMap();
    const st = (tr) => (state.has(tr) || state.set(tr, { pan: 0, tilt: 0, zoom: 100 }), state.get(tr));
    P.getCapabilities = function () {
      const c = caps0.call(this);
      return this.kind !== 'video' ? c : { ...c, pan: { min: -180000, max: 180000, step: 3600 }, tilt: { min: -180000, max: 180000, step: 3600 }, zoom: { min: 100, max: 400, step: 1 } };
    };
    P.getSettings = function () { const s = set0.call(this); return this.kind === 'video' ? { ...s, ...st(this) } : s; };
    P.applyConstraints = async function (c) { Object.assign(st(this), (c.advanced || [])[0] || {}); };
  });
}

// Barre flottante : Document Picture-in-Picture remplacé par une fenêtre ordinaire (headless).
export async function fakePip(page) {
  await page.addInitScript(() => {
    window.documentPictureInPicture = { requestWindow: async () => window.open('about:blank', 'pip', 'width=470,height=58') };
  });
}

export async function open(page) {
  await page.goto('/');
  await expect(page.locator('#session-title')).toHaveAttribute('placeholder', /Session du/);
}

export async function addCamera(page) {
  const n = await page.locator('.cam').count();
  await page.click('#btn-add-cam');
  await expect(page.locator('.cam')).toHaveCount(n + 1);
  await page.waitForFunction((i) => document.querySelectorAll('.cam video')[i]?.videoWidth > 0, n);
}

export async function narrate(page, ms = 2500) {
  await page.click('#btn-narrate');
  await expect(page.locator('#btn-narrate')).toHaveClass(/rec/);
  await page.waitForTimeout(ms);
  await page.click('#btn-narrate');
  await expect(page.locator('#btn-narrate')).not.toHaveClass(/rec/);
}

export const count = (page) => page.locator('#tl-count');

export const dbCount = (page, store) =>
  page.evaluate((name) => new Promise((resolve) => {
    const q = indexedDB.open('docmate');
    q.onsuccess = () => { const r = q.result.transaction(name).objectStore(name).count(); r.onsuccess = () => resolve(r.result); };
  }), store);

// Confirmations (window.confirm) acceptées ; les messages sont gardés pour vérification.
export function acceptDialogs(page) {
  const messages = [];
  page.on('dialog', (d) => { messages.push(d.message()); d.accept(); });
  return messages;
}

// Erreurs de la page : un parcours échoue s'il y en a.
export function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

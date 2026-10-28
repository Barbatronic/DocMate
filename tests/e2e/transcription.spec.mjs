// Moteur de transcription locale : GPU annoncé mais inutilisable (fréquent sous Linux).
import { test, expect } from '@playwright/test';
import { stubWhisper, initialSettings } from './helpers.mjs';

// WAV silencieux de 1 s, transcrit par le module de transcription.
const transcribeOnce = (page) => page.evaluate(async () => {
  const { transcribe } = await import('/js/ai/transcribe.js');
  const sr = 16000, n = sr;
  const h = new DataView(new ArrayBuffer(44));
  const w = (o, s) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); h.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true);
  h.setUint16(22, 1, true); h.setUint32(24, sr, true); h.setUint32(28, sr * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true);
  w(36, 'data'); h.setUint32(40, n * 2, true);
  const msgs = [];
  const seg = await transcribe(new Blob([h, new Int16Array(n)], { type: 'audio/wav' }), (m) => msgs.push(m));
  return { text: seg[0]?.text, msgs };
});

test('erreur WebGPU : nouvel essai sur le processeur, puis processeur d\'emblée', async ({ page }) => {
  await initialSettings(page, { transcription: { provider: 'local' } });
  await stubWhisper(page, `self.onmessage = ({ data }) => {
    if (!data.cpuOnly) return self.postMessage({ error: 'no available backend found. ERR: [webgpu] Error: Failed to get GPU adapter.' });
    self.postMessage({ segments: [{ start: 0, end: 1, text: 'processeur' }] });
  };`);
  await page.goto('/phone.html');
  const first = await transcribeOnce(page);
  expect(first.text).toBe('processeur');
  expect(first.msgs).toContain('GPU inutilisable : calcul sur le processeur.');
  const second = await transcribeOnce(page);
  expect(second.msgs).not.toContain('GPU inutilisable : calcul sur le processeur.');
});

test('vrai Whisper local sans GPU utilisable @network', async ({ page }) => {
  test.setTimeout(300_000);
  await initialSettings(page, { transcription: { provider: 'local', localModel: 'onnx-community/whisper-tiny' } });
  await page.goto('/phone.html');
  const r = await transcribeOnce(page);
  expect(r.msgs.some((m) => m.startsWith('Transcription locale'))).toBe(true);
});

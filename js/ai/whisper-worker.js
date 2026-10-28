// Worker : Whisper local via transformers.js (WebGPU si un GPU est vraiment utilisable, sinon WASM).
// Le modèle est téléchargé au premier usage puis mis en cache par le navigateur.
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/+esm';

const LANGS = { fr: 'french', en: 'english', es: 'spanish', de: 'german', it: 'italian', pt: 'portuguese', nl: 'dutch' };
let asr, loaded, device;

const progress_callback = (p) => p.status === 'progress' && self.postMessage({ progress: `Modèle ${p.file} ${Math.round(p.progress)} %` });

// `navigator.gpu` existe souvent sans GPU utilisable (Linux, pilotes non pris en charge) : on demande
// un adaptateur avant de choisir WebGPU.
async function webgpuUsable() {
  try {
    return !!(await navigator.gpu?.requestAdapter());
  } catch {
    return false;
  }
}

async function load(model, forceWasm = false) {
  if (!forceWasm && (await webgpuUsable())) {
    try {
      asr = await pipeline('automatic-speech-recognition', model, { device: 'webgpu', dtype: 'fp32', progress_callback });
      device = 'webgpu';
      loaded = model;
      return;
    } catch (e) {
      self.postMessage({ progress: `WebGPU indisponible (${e?.message || e}) : calcul sur le processeur.` });
    }
  }
  asr = await pipeline('automatic-speech-recognition', model, { device: 'wasm', dtype: 'q8', progress_callback });
  device = 'wasm';
  loaded = model;
}

const run = (data) =>
  asr(data.audio, {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
    language: LANGS[data.language] || data.language || null,
    task: 'transcribe',
  });

self.onmessage = async ({ data }) => {
  try {
    if (!asr || loaded !== data.model || (data.cpuOnly && device === 'webgpu')) await load(data.model, data.cpuOnly);
    self.postMessage({ progress: `Transcription locale (${device === 'webgpu' ? 'GPU' : 'processeur'})…` });
    let out;
    try {
      out = await run(data);
    } catch (e) {
      // Le GPU peut aussi lâcher pendant le calcul : on refait sur le processeur.
      if (device !== 'webgpu') throw e;
      self.postMessage({ progress: `Erreur WebGPU (${e?.message || e}) : nouvel essai sur le processeur.` });
      await load(data.model, true);
      out = await run(data);
    }
    const segments = (out.chunks || [{ timestamp: [0, 0], text: out.text }]).map((c) => ({
      start: c.timestamp[0] ?? 0,
      end: c.timestamp[1] ?? c.timestamp[0] ?? 0,
      text: c.text.trim(),
    }));
    self.postMessage({ segments });
  } catch (e) {
    self.postMessage({ error: String(e?.message || e) });
  }
};

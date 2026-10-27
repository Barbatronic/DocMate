// Worker : Whisper local via transformers.js (WebGPU si disponible, sinon WASM).
// Le modèle est téléchargé au premier usage puis mis en cache par le navigateur.
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/+esm';

const LANGS = { fr: 'french', en: 'english', es: 'spanish', de: 'german', it: 'italian', pt: 'portuguese', nl: 'dutch' };
let asr, loaded;

self.onmessage = async ({ data }) => {
  try {
    if (!asr || loaded !== data.model) {
      const device = 'gpu' in navigator ? 'webgpu' : 'wasm';
      asr = await pipeline('automatic-speech-recognition', data.model, {
        device,
        dtype: device === 'webgpu' ? 'fp32' : 'q8',
        progress_callback: (p) => p.status === 'progress' && self.postMessage({ progress: `Modèle ${p.file} ${Math.round(p.progress)} %` }),
      });
      loaded = data.model;
    }
    self.postMessage({ progress: 'Transcription locale…' });
    const out = await asr(data.audio, {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
      language: LANGS[data.language] || data.language || null,
      task: 'transcribe',
    });
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

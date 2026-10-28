// Transcription horodatée des segments de narration.
// Retourne [{start, end, text}] en secondes depuis le début du segment.
import { S } from '../core/settings.js';
import { extOf } from '../capture/media.js';
import { explainOpenAIError } from './agent.js';

const OPENAI_SDK = 'https://cdn.jsdelivr.net/npm/openai@7.45.1/+esm';

// Whisper local : un seul worker, les transcriptions passent l'une après l'autre.
let localQueue = Promise.resolve();

export async function transcribe(blob, onProgress) {
  const cfg = S.transcription;
  if (cfg.provider === 'none') return [];
  if (cfg.provider === 'local') {
    const job = localQueue.then(() => transcribeLocal(blob, onProgress));
    localQueue = job.catch(() => {});
    return job;
  }
  return transcribeOpenAI(blob);
}

async function transcribeOpenAI(blob) {
  const cfg = S.transcription;
  const apiKey = cfg.openaiKey || S.agent.openaiKey;
  if (!apiKey) throw new Error('Clé API de transcription manquante (Réglages › Transcription).');
  const { default: OpenAI } = await import(OPENAI_SDK);
  const client = new OpenAI({ apiKey, baseURL: cfg.openaiBaseUrl || undefined, dangerouslyAllowBrowser: true });
  const file = new File([blob], `narration.${extOf(blob.type)}`, { type: blob.type });
  // whisper-1 (et les API compatibles, ex. Groq) donnent des segments horodatés.
  const verbose = /whisper/i.test(cfg.openaiModel);
  const res = await client.audio.transcriptions.create({
    file,
    model: cfg.openaiModel,
    language: cfg.language || undefined,
    response_format: verbose ? 'verbose_json' : 'json',
    ...(verbose ? { timestamp_granularities: ['segment'] } : {}),
  }).catch(explainOpenAIError);
  if (res.segments?.length) return res.segments.map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }));
  return res.text ? [{ start: 0, end: 0, text: res.text.trim() }] : [];
}

// Whisper dans le navigateur (transformers.js), dans un worker pour ne pas figer l'interface.
// Version dans l'adresse du worker : le navigateur le garde en cache même après un rechargement forcé
// de la page (il est créé plus tard). À incrémenter à chaque modification de whisper-worker.js.
const WORKER_VERSION = 4;
let worker;
let cpuOnly = false; // WebGPU a échoué une fois : processeur pour la suite de la session

function ask(audio, onProgress) {
  worker ??= new Worker(new URL(`./whisper-worker.js?v=${WORKER_VERSION}`, import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    worker.onmessage = ({ data }) => {
      if (data.progress) onProgress?.(data.progress);
      else if (data.error) reject(new Error(data.error));
      else resolve(data.segments);
    };
    worker.onerror = (e) => reject(new Error(e.message || 'Whisper : le worker a planté.'));
    // Copié (pas transféré) : on peut le renvoyer si le premier essai échoue.
    worker.postMessage({ audio, model: S.transcription.localModel, language: S.transcription.language, cpuOnly });
  });
}

async function transcribeLocal(blob, onProgress) {
  const ctx = new AudioContext({ sampleRate: 16000 });
  const audio = (await ctx.decodeAudioData(await blob.arrayBuffer())).getChannelData(0);
  ctx.close();
  try {
    return await ask(audio, onProgress);
  } catch (e) {
    // Le navigateur annonce un GPU qu'il ne peut pas fournir (fréquent sous Linux) : on relance
    // un worker neuf, calcul sur le processeur.
    if (cpuOnly || !/webgpu|gpu adapter|backend/i.test(e.message)) throw e;
    cpuOnly = true;
    worker.terminate();
    worker = null;
    onProgress?.('GPU inutilisable : calcul sur le processeur.');
    return ask(audio, onProgress);
  }
}

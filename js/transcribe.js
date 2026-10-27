// Transcription horodatée des segments de narration.
// Retourne [{start, end, text}] en secondes depuis le début du segment.
import { S } from './settings.js';
import { extOf } from './media.js';
import { explainOpenAIError } from './agent.js';

const OPENAI_SDK = 'https://cdn.jsdelivr.net/npm/openai@7.45.1/+esm';

export async function transcribe(blob, onProgress) {
  const cfg = S.transcription;
  if (cfg.provider === 'none') return [];
  if (cfg.provider === 'local') return transcribeLocal(blob, onProgress);
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
let worker;
async function transcribeLocal(blob, onProgress) {
  const ctx = new AudioContext({ sampleRate: 16000 });
  const audio = (await ctx.decodeAudioData(await blob.arrayBuffer())).getChannelData(0);
  ctx.close();
  worker ??= new Worker(new URL('./whisper-worker.js', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    worker.onmessage = ({ data }) => {
      if (data.progress) onProgress?.(data.progress);
      else if (data.error) reject(new Error(data.error));
      else resolve(data.segments);
    };
    worker.postMessage({ audio, model: S.transcription.localModel, language: S.transcription.language }, [audio.buffer]);
  });
}

// Réglages, stockés dans le localStorage du navigateur (clés API comprises : jamais envoyées ailleurs
// qu'au fournisseur choisi).
import { PRESETS } from './profiles.js';

const KEY = 'docmate.settings';

const DEFAULTS = {
  lang: '',
  agent: {
    provider: 'anthropic', // anthropic | openai | ollama
    anthropicModel: 'claude-opus-5',
    anthropicEffort: 'high',
    anthropicKey: '',
    openaiModel: 'gpt-5',
    openaiBaseUrl: '',
    openaiKey: '',
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'qwen2.5vl:7b',
    maxImages: 60,
    imagePx: 1280,
  },
  transcription: {
    provider: 'openai', // openai | local | none
    openaiModel: 'whisper-1',
    openaiBaseUrl: '',
    openaiKey: '', // vide = clé OpenAI de l'agent
    localModel: 'onnx-community/whisper-base',
    language: 'fr',
  },
  capture: {
    width: 1920,
    height: 1080,
    clipAudio: true,
    micId: '',
    cameras: [], // deviceId des tuiles ouvertes
  },
  profiles: structuredClone(PRESETS),
  profileId: PRESETS[0].id,
  extraInstructions: '',
};

function merge(base, over) {
  if (!over || typeof over !== 'object' || Array.isArray(base)) return over ?? base;
  const out = { ...base };
  for (const k of Object.keys(over)) {
    out[k] = base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) ? merge(base[k], over[k]) : over[k];
  }
  return out;
}

export let S = load();

function load() {
  try {
    return merge(structuredClone(DEFAULTS), JSON.parse(localStorage.getItem(KEY) || '{}'));
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch (e) {
    console.warn('Réglages non enregistrés', e);
  }
}

export const profile = () => S.profiles.find((p) => p.id === S.profileId) || S.profiles[0];

export function resetProfiles() {
  S.profiles = structuredClone(PRESETS);
  S.profileId = PRESETS[0].id;
  save();
}

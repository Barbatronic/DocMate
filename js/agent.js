// Agent de rédaction : timeline horodatée (paroles + médias) -> brouillon structuré (JSON).
// Fournisseurs : Anthropic (Claude), OpenAI ou compatible, Ollama (local).
import { S, profile } from './settings.js';
import { getBlob } from './store.js';
import { shrink } from './media.js';

const ANTHROPIC_SDK = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.3.0/+esm';
const OPENAI_SDK = 'https://cdn.jsdelivr.net/npm/openai@7.45.1/+esm';

export const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Titre court du document' },
    slug: { type: 'string', description: 'kebab-case ASCII, 3 à 6 mots' },
    description: { type: 'string', description: 'Une ou deux phrases de résumé' },
    state: { type: 'string', description: "État à la fin de la session (ex. « en cours », « OK », « à corriger »), vide si inconnu" },
    next_step: { type: 'string', description: 'Prochaine étape évoquée, vide si rien' },
    body: { type: 'string', description: 'Corps Markdown, sans front matter, avec les marqueurs [[media:ID]]' },
    media: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          filename: { type: 'string', description: 'kebab-case ASCII sans extension' },
          alt: { type: 'string' },
          caption: { type: 'string' },
        },
        required: ['id', 'filename', 'alt', 'caption'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'slug', 'description', 'state', 'next_step', 'body', 'media'],
  additionalProperties: false,
};

const hhmmss = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');
};

const KIND = {
  photo: 'PHOTO', phone_photo: 'PHOTO (téléphone)', screenshot: "CAPTURE D'ÉCRAN",
  clip: 'CLIP VIDÉO', phone_video: 'VIDÉO (téléphone)',
};

export function systemPrompt(p, { handoff = false } = {}) {
  const examples = (p.examples || [])
    .filter((e) => e.text?.trim())
    .map((e, i) => `<exemple numero="${i + 1}" fichier="${e.name}">\n${e.text.slice(0, 20000)}\n</exemple>`)
    .join('\n\n');
  return `Tu es DocMate, un assistant qui rédige la documentation d'un maker à partir de sa session d'atelier.

Tu reçois la timeline chronologique d'une session : ce que l'auteur a dit (transcription horodatée de sa narration), les photos, clips vidéo, captures d'écran, repères et notes écrites, chacun avec son heure. Les médias et les paroles proches dans le temps parlent généralement de la même chose : sers-t'en pour placer chaque média au bon endroit du texte.

Ta tâche : rédiger le document en Markdown, à la première personne, comme si l'auteur l'avait écrit, en restant fidèle à ce qu'il a dit et à ce qui est visible.

Règles :
- N'invente rien. Ce qui n'est ni dit ni visible n'est pas écrit. Une information manquante mais nécessaire se signale entre crochets : [À PRÉCISER : ...].
- Reformule l'oral en écrit propre : enlève les hésitations, répétitions et digressions, garde les chiffres, références, valeurs et explications techniques.
${handoff
  ? "- Insère chaque média à l'endroit où il illustre le texte, avec les gabarits de la mission. Écarte les médias flous, en double ou sans intérêt.\n- Pour chaque média publié : un nom de fichier court et parlant, un texte alternatif qui décrit l'image, une légende courte."
  : "- Insère un média en écrivant le marqueur [[media:ID]] seul sur sa ligne, à l'endroit où il illustre le texte. N'utilise que les ID fournis. Écarte les médias flous, en double ou sans intérêt (ne les mets pas dans le corps).\n- Pour chaque média utilisé, donne dans \"media\" : un nom de fichier court et parlant (kebab-case, ASCII, sans extension), un texte alternatif qui décrit l'image, une légende courte.\n- Pas de front matter dans \"body\" : il est généré à partir des autres champs."}
- Un REPÈRE indique un moment que l'auteur juge important. Une NOTE ÉCRITE est une information fiable de l'auteur.
- La langue du document est celle de la narration, sauf consigne contraire.

Style à respecter :
${p.styleGuide || '(aucune consigne)'}
${examples ? `\nVoici des documents déjà écrits par l'auteur. Imite leur ton, leur structure et leur niveau de détail (pas leur contenu) :\n\n${examples}` : ''}`;
}

// Construit la timeline : liste de parties {text}, puis
//  - embed=true  : {image:{b64, mime}} (images réduites, budget d'images appliqué) pour un appel API ;
//  - embed=false : {ref:{blobId, ev, role}} (tous les médias) pour l'export vers un agent.
export async function buildTimeline(session, events, onProgress, { embed = true } = {}) {
  const p = S.agent;
  const parts = [];
  const items = [];
  for (const ev of events) {
    if (ev.type === 'audio') {
      for (const seg of ev.transcript || []) items.push({ t: ev.t + seg.start * 1000, speech: seg.text });
    } else {
      items.push({ t: ev.t, ev });
    }
  }
  items.sort((a, b) => a.t - b.t);

  // Budget d'images : photos et captures d'abord, puis images clés des clips.
  const visual = events.filter((e) => KIND[e.type]);
  let perClip = embed ? 3 : 6;
  const count = () => visual.reduce((n, e) => n + (e.type === 'clip' ? Math.min(perClip, e.keyframes?.length || 0) : 1), 0);
  if (embed) while (count() > p.maxImages && perClip > 1) perClip--;
  const keepEvery = embed ? Math.max(1, Math.ceil(count() / p.maxImages)) : 1;

  const date = new Date(session.started);
  parts.push({
    text:
      `SESSION du ${date.toLocaleDateString('fr-FR')} à ${date.toLocaleTimeString('fr-FR')}` +
      (session.project ? `\nProjet : ${session.project}` : '') +
      (session.title ? `\nSujet indiqué par l'auteur : ${session.title}` : '') +
      `\nDurée : ${hhmmss((session.ended || events.at(-1)?.tEnd || events.at(-1)?.t || session.started) - session.started)}` +
      '\n\nTIMELINE (heure relative au début de la session) :',
  });

  let speech = [];
  const flush = () => {
    if (speech.length) parts.push({ text: speech.join('\n') });
    speech = [];
  };
  let i = 0;
  for (const it of items) {
    const at = `[+${hhmmss(it.t - session.started)}]`;
    if (it.speech) { speech.push(`${at} PAROLE : ${it.speech}`); continue; }
    const ev = it.ev;
    if (ev.type === 'marker') { speech.push(`${at} REPÈRE${ev.text ? ' : ' + ev.text : ''}`); continue; }
    if (ev.type === 'note') { speech.push(`${at} NOTE ÉCRITE : ${ev.text}`); continue; }
    if (!KIND[ev.type]) continue;
    flush();
    const dur = ev.tEnd ? ` · durée ${Math.round((ev.tEnd - ev.t) / 1000)} s` : '';
    const caption = ev.text ? ` · note de l'auteur : ${ev.text}` : '';
    parts.push({ text: `${at} ${KIND[ev.type]} id=${ev.id} · source : ${ev.source || '?'}${dur}${caption}` });
    const ids = ev.type === 'clip' || ev.type === 'phone_video'
      ? (ev.keyframes?.length ? ev.keyframes.slice(0, perClip) : ev.thumbId ? [ev.thumbId] : [])
      : [ev.blobId];
    if (!embed) {
      parts.push({ ref: { blobId: ev.blobId, ev, role: 'original' } });
      if (ids[0] !== ev.blobId) ids.forEach((bid, k) => parts.push({ ref: { blobId: bid, ev, role: `aperçu ${k + 1}` } }));
      continue;
    }
    if (ev.type === 'clip' && ids.length) parts.push({ text: `(images extraites du clip ${ev.id})` });
    for (const bid of ids) {
      if (i++ % keepEvery) continue;
      const blob = await getBlob(bid);
      if (!blob) continue;
      onProgress?.(`Préparation des images… ${i}`);
      const small = await shrink(blob, p.imagePx, 'image/jpeg', 0.8);
      parts.push({ image: { mime: 'image/jpeg', b64: await toB64(small) } });
    }
  }
  flush();
  if (session.instructions) parts.push({ text: `\nCONSIGNES DE L'AUTEUR POUR CE DOCUMENT :\n${session.instructions}` });
  parts.push({ text: '\nRédige maintenant le document.' });
  return parts;
}

const toB64 = (blob) =>
  new Promise((r) => {
    const fr = new FileReader();
    fr.onload = () => r(fr.result.split(',')[1]);
    fr.readAsDataURL(blob);
  });

export async function draft(session, events, onProgress, extraExamples = []) {
  const a = S.agent;
  if (a.provider === 'anthropic' && !a.anthropicKey) throw new Error('Clé API Anthropic manquante (Réglages › IA).');
  if (a.provider === 'openai' && !a.openaiKey && !a.openaiBaseUrl) throw new Error('Clé API OpenAI manquante (Réglages › IA).');
  const parts = await buildTimeline(session, events, onProgress);
  const p = profile();
  const system = systemPrompt({ ...p, examples: [...(p.examples || []), ...extraExamples] });
  const provider = S.agent.provider;
  onProgress?.(`Rédaction par l'IA (${provider})…`);
  const text = await { anthropic, openai, ollama }[provider](system, parts, onProgress);
  return parseDraft(text);
}

function parseDraft(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Réponse de l'IA illisible (pas de JSON).");
  const d = JSON.parse(m[0]);
  d.media ||= [];
  return d;
}

// ---------- Anthropic ----------
async function anthropic(system, parts, onProgress) {
  const a = S.agent;
  if (!a.anthropicKey) throw new Error('Clé API Anthropic manquante (Réglages › IA).');
  const { default: Anthropic } = await import(ANTHROPIC_SDK);
  const client = new Anthropic({ apiKey: a.anthropicKey, dangerouslyAllowBrowser: true });
  const content = parts.map((p) =>
    p.image ? { type: 'image', source: { type: 'base64', media_type: p.image.mime, data: p.image.b64 } } : { type: 'text', text: p.text },
  );
  const params = {
    model: a.anthropicModel,
    max_tokens: 64000,
    system,
    thinking: { type: 'adaptive' },
    output_config: { effort: a.anthropicEffort, format: { type: 'json_schema', schema: DRAFT_SCHEMA } },
    messages: [{ role: 'user', content }],
  };
  // Repli automatique côté serveur si le modèle décline (les modèles qui ne le gèrent pas refusent : on réessaie sans).
  let stream;
  try {
    stream = client.beta.messages.stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    return textOf(await follow(stream, onProgress));
  } catch (e) {
    if (!(e instanceof Anthropic.BadRequestError) || !/fallback/i.test(e.message)) throw e;
    stream = client.messages.stream(params);
    return textOf(await follow(stream, onProgress));
  }
}

async function follow(stream, onProgress) {
  let n = 0;
  stream.on('text', (d) => { n += d.length; onProgress?.(`Rédaction… ${n} caractères`); });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error("L'IA a refusé la demande.");
  if (msg.stop_reason === 'max_tokens') throw new Error('Réponse tronquée (document trop long).');
  return msg;
}

const textOf = (msg) => msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');

// ---------- OpenAI et compatibles ----------
async function openai(system, parts) {
  const a = S.agent;
  if (!a.openaiKey && !a.openaiBaseUrl) throw new Error('Clé API OpenAI manquante (Réglages › IA).');
  const { default: OpenAI } = await import(OPENAI_SDK);
  const client = new OpenAI({ apiKey: a.openaiKey || 'none', baseURL: a.openaiBaseUrl || undefined, dangerouslyAllowBrowser: true });
  const content = parts.map((p) =>
    p.image ? { type: 'image_url', image_url: { url: `data:${p.image.mime};base64,${p.image.b64}` } } : { type: 'text', text: p.text },
  );
  const res = await client.chat.completions.create({
    model: a.openaiModel,
    messages: [{ role: 'system', content: system }, { role: 'user', content }],
    response_format: { type: 'json_schema', json_schema: { name: 'docmate_draft', strict: true, schema: DRAFT_SCHEMA } },
  }).catch(explainOpenAIError);
  return res.choices[0].message.content || '';
}

// ---------- Ollama (local) ----------
async function ollama(system, parts) {
  const a = S.agent;
  const text = parts.filter((p) => p.text).map((p) => p.text).join('\n') +
    '\n\n(Les images jointes sont dans l\'ordre des médias de la timeline.)';
  const images = parts.filter((p) => p.image).map((p) => p.image.b64);
  let res;
  try {
    res = await fetch(`${a.ollamaUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: a.ollamaModel,
        stream: false,
        format: DRAFT_SCHEMA,
        options: { num_ctx: 32768 },
        messages: [{ role: 'system', content: system }, { role: 'user', content: text, images }],
      }),
    });
  } catch {
    throw new Error(`Ollama injoignable sur ${a.ollamaUrl}. Lancez Ollama avec OLLAMA_ORIGINS=${location.origin} (voir README).`);
  }
  if (!res.ok) throw new Error(`Ollama : ${res.status} ${await res.text()}`);
  return (await res.json()).message?.content || '';
}

// OpenAI n'ajoute pas d'en-tête CORS à ses réponses d'erreur : le navigateur n'y voit qu'une « Connection error ».
export function explainOpenAIError(e) {
  if (/connection error/i.test(e?.message || '')) {
    throw new Error("Requête refusée par l'API (clé invalide, quota épuisé, modèle inconnu) ou réseau indisponible.");
  }
  throw e;
}

// Rédaction par l'outil d'IA de l'utilisateur (Claude Desktop, Claude Code, Cursor, VS Code, Codex…),
// avec son propre compte, sans clé API. L'outil lance le serveur MCP local (mcp/server.mjs), et cet
// onglet s'y branche en WebSocket pour répondre à ses demandes : session, timeline, images,
// transcription, puis réception du brouillon, relu ensuite dans « Générer la doc ».
//
// Connexion seulement avec le fournisseur « MCP » : à la première ouverture de « Générer la doc »,
// puis dès le démarrage une fois qu'elle a réussi. Nouvel essai régulier tant que le serveur ne répond pas.
import { S, profile } from '../core/settings.js';
import { emit } from '../core/bus.js';
import { getBlob } from '../core/store.js';
import { shrink } from '../capture/media.js';
import { state } from '../session/session.js';
import { transcribeAll } from '../session/transcription.js';
import { buildTimeline, systemPrompt, toB64 } from './agent.js';

const SEEN_KEY = 'docmate.mcp'; // une connexion a déjà réussi : on se rebranche au démarrage
const RETRY_MS = 3000;
const VIDEO = new Set(['clip', 'phone_video']);
const COUNTED = { photo: 'photo(s)', phone_photo: 'photo(s) du téléphone', screenshot: "capture(s) d'écran", clip: 'clip(s) vidéo', phone_video: 'vidéo(s) du téléphone', audio: 'segment(s) de narration', marker: 'repère(s)', note: 'note(s) écrite(s)' };

export const mcp = { connected: false, replaced: false };

let ws = null;
let retry = null;
let hooks = {};

const seen = () => { try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; } };

function setStatus(patch) {
  Object.assign(mcp, patch);
  emit('mcp', mcp);
}

// À appeler à l'ouverture de « Générer la doc », ou quand le fournisseur ou le port change.
export function connectMcp() {
  clearTimeout(retry);
  if (S.agent.provider !== 'mcp') {
    ws?.close();
    setStatus({ connected: false, replaced: false });
    return;
  }
  if (ws) return;
  setStatus({ replaced: false });
  const sock = new WebSocket(`ws://127.0.0.1:${S.agent.mcpPort}/tab`);
  ws = sock;
  sock.onopen = () => {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* sans stockage */ }
    setStatus({ connected: true });
  };
  sock.onmessage = (e) => onRequest(JSON.parse(e.data));
  sock.onclose = (e) => {
    if (ws !== sock) return;
    ws = null;
    setStatus({ connected: false, replaced: e.code === 4001 });
    // Remplacé par un autre onglet DocMate : on lui laisse la place (on reprend la main au retour sur cet onglet).
    if (e.code !== 4001) retry = setTimeout(connectMcp, RETRY_MS);
  };
}

export function reconnectMcp() {
  ws?.close();
  ws = null;
  connectMcp();
}

// hooks.examples() : docs récentes du site (modèles de style) ; hooks.onDraft(d) : brouillon reçu.
export function initMcp(h) {
  hooks = h;
  if (seen()) connectMcp();
  addEventListener('focus', () => mcp.replaced && connectMcp());
}

async function onRequest(msg) {
  if (!msg.id) return; // hello du serveur
  const reply = (r) => ws?.send(JSON.stringify({ id: msg.id, ...r }));
  const tool = TOOLS[msg.method];
  if (!tool) return reply({ error: `Outil inconnu : ${msg.method}` });
  try {
    reply({ result: await tool(msg.params || {}) });
  } catch (e) {
    reply({ result: { content: [{ type: 'text', text: e.message || String(e) }], isError: true } });
  }
}

const text = (s) => ({ content: [{ type: 'text', text: s }] });

const pendingAudio = () => state.events.filter((e) => e.type === 'audio' && !e.transcript);

// Images d'aperçu d'une vidéo (les mêmes que celles listées par la timeline).
const previews = (ev) => (ev.keyframes?.length ? ev.keyframes.slice(0, 6) : ev.thumbId ? [ev.thumbId] : []);

const TOOLS = {
  async get_session() {
    const s = state.session;
    if (!s) throw new Error('Aucune session ouverte dans DocMate.');
    const counts = Object.entries(COUNTED)
      .map(([type, label]) => [state.events.filter((e) => e.type === type).length, label])
      .filter(([n]) => n)
      .map(([n, label]) => `${n} ${label}`);
    const todo = pendingAudio().length;
    const p = profile();
    const examples = (await hooks.examples?.().catch(() => [])) || [];
    return text(
      `# Session DocMate\n\n` +
      `Sujet : ${s.title || '(non indiqué)'}\n` +
      `Projet : ${s.project || '(aucun)'}\n` +
      `Contenu : ${counts.join(', ') || 'vide'}\n` +
      `Profil de sortie : ${p.name}\n` +
      (todo ? `\n⚠ ${todo} segment(s) de narration non transcrit(s) : appelle transcribe avant get_timeline.\n` : '') +
      (examples.length ? `\n${examples.length} doc(s) récente(s) du projet jointes aux consignes comme modèles de style.\n` : '') +
      `\n# Consignes de rédaction\n\n${systemPrompt({ ...p, examples: [...(p.examples || []), ...examples] })}\n` +
      `\n# Rendu\n\nEnvoie le document avec submit_draft. DocMate écrit le front matter, le document et les médias dans le site après relecture par l'auteur : n'écris pas ces fichiers toi-même.`,
    );
  },

  async get_timeline() {
    if (!state.events.length) throw new Error('La session est vide.');
    const parts = await buildTimeline(state.session, state.events, null, { embed: false });
    const lines = [];
    for (const part of parts) {
      if (part.text) { lines.push(part.text); continue; }
      const { ev, role } = part.ref;
      if (role === 'original') { if (!VIDEO.has(ev.type)) lines.push(`  image : ${ev.id}`); }
      else lines.push(`  ${role} : ${ev.id}/${role.match(/\d+/)[0]}`);
    }
    lines.push("\nRegarde les images avec get_images (références « image » et « aperçu » ci-dessus), puis envoie le document avec submit_draft. Dans le corps, un média s'insère par [[media:ID]] (ID du média, sans « /n »).");
    return text(lines.join('\n'));
  },

  async get_images({ refs = [] }) {
    const content = [];
    for (const ref of refs.slice(0, 8).map(String)) {
      const [id, k] = ref.split('/');
      const ev = state.events.find((e) => e.id === id);
      const blobId = !ev ? null : k ? previews(ev)[k - 1] : VIDEO.has(ev.type) ? previews(ev)[0] : ev.blobId;
      const blob = blobId && (await getBlob(blobId));
      if (!blob?.type.startsWith('image/')) {
        content.push({ type: 'text', text: `${ref} : aucune image` });
        continue;
      }
      const small = await shrink(blob, S.agent.imagePx, 'image/jpeg', 0.8);
      content.push({ type: 'text', text: ref }, { type: 'image', mimeType: 'image/jpeg', data: await toB64(small) });
    }
    return { content };
  },

  async transcribe() {
    const todo = pendingAudio().length;
    if (!todo) return text('Toutes les narrations sont déjà transcrites.');
    if (S.transcription.provider === 'none') throw new Error('La transcription est désactivée dans DocMate (Réglages › Transcription).');
    await transcribeAll();
    return text(`${todo} segment(s) de narration transcrit(s). Appelle get_timeline.`);
  },

  async submit_draft(d) {
    const errors = [];
    for (const k of ['title', 'slug', 'description', 'state', 'next_step', 'body']) {
      if (typeof d[k] !== 'string') errors.push(`champ « ${k} » manquant`);
      d[k] ??= '';
    }
    if (!Array.isArray(d.media)) d.media = [];
    const ids = new Set(state.events.map((e) => e.id));
    const markers = [...String(d.body).matchAll(/\[\[media:([^\]]*)\]\]/g)].map((m) => m[1].trim());
    const unknown = markers.filter((id) => !ids.has(id));
    if (unknown.length) errors.push(`médias inconnus dans body : ${unknown.join(', ')} (utilise l'ID du média donné par get_timeline)`);
    const inline = String(d.body).split('\n').filter((l) => l.includes('[[media:') && !/^[ \t]*\[\[media:[\w-]+\]\][ \t]*$/.test(l));
    if (inline.length) errors.push('chaque [[media:ID]] doit être seul sur sa ligne');
    if (errors.length) throw new Error(`Brouillon refusé : ${errors.join(' ; ')}.`);
    d.media = d.media.filter((m) => ids.has(m.id));
    await hooks.onDraft?.(d);
    return text("Brouillon reçu. L'auteur le relit dans DocMate, puis l'écrit dans son site. Pour une nouvelle version, renvoie-le avec submit_draft.");
  },
};

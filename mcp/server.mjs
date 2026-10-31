#!/usr/bin/env node
// DocMate MCP : relie l'outil d'IA de l'utilisateur (Claude Desktop, Claude Code, Cursor, VS Code,
// Codex…) à l'onglet DocMate ouvert dans le navigateur. L'IA rédige avec le compte de l'utilisateur,
// sans clé API dans DocMate.
//
//   outil d'IA ⇄ stdio (MCP) ⇄ ce serveur ⇄ WebSocket 127.0.0.1:8777 ⇄ onglet DocMate
//
// Chaque outil d'IA lance son propre serveur. Le premier ouvre le port (le relais), les suivants s'y
// branchent et lui passent leurs demandes. L'onglet fait le travail (timeline, images, brouillon) :
// ce serveur ne fait que transmettre. Sans dépendance, Node 22 ou plus.
//
// Variables : DOCMATE_PORT (8777), DOCMATE_ORIGINS (adresses de DocMate en plus, séparées par des virgules).
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { DRAFT_SCHEMA } from '../js/ai/draft-schema.js';

const VERSION = '1.0.0';
const PORT = Number(process.env.DOCMATE_PORT) || 8777;
const ORIGINS = [
  'https://barbatronic.fr',
  'https://www.barbatronic.fr',
  'https://barbatronic.github.io',
  ...(process.env.DOCMATE_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
];
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const log = (...a) => console.error('[docmate-mcp]', ...a);

const NOT_CONNECTED =
  "DocMate n'est pas connecté. Demandez à l'auteur d'ouvrir DocMate dans son navigateur, de choisir " +
  `« Mon outil d'IA (MCP) » dans Réglages › IA, puis d'ouvrir « Générer la doc » (port ${PORT}).`;

// ---------- Outils et prompt ----------
const READ_ONLY = { readOnlyHint: true, openWorldHint: false };
const TOOLS = [
  {
    name: 'get_session',
    title: 'Session DocMate',
    description:
      "Session DocMate en cours : sujet, projet, contenu, état de la transcription, et les consignes de rédaction de l'auteur (règles, style, exemples de ses docs). À appeler en premier.",
    inputSchema: { type: 'object', properties: {} },
    annotations: READ_ONLY,
  },
  {
    name: 'get_timeline',
    title: 'Timeline de la session',
    description:
      "Timeline horodatée de la session : paroles transcrites de la narration, repères, notes écrites, et chaque média avec son id et les références de ses images (à demander à get_images).",
    inputSchema: { type: 'object', properties: {} },
    annotations: READ_ONLY,
  },
  {
    name: 'get_images',
    title: 'Images de la session',
    description:
      "Images de la session (photos, captures d'écran, images clés des vidéos), d'après les références données par get_timeline. 8 au plus par appel. Les images comptent autant que la parole.",
    inputSchema: {
      type: 'object',
      properties: {
        refs: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 8, description: 'Références de get_timeline, ex. ["m3x9k2", "c7d1aa/2"]' },
      },
      required: ['refs'],
    },
    annotations: READ_ONLY,
  },
  {
    name: 'transcribe',
    title: 'Transcrire la narration',
    description:
      "Transcrit dans DocMate les narrations qui ne l'ont pas encore été (plusieurs minutes possibles). À appeler si get_session en signale.",
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'submit_draft',
    title: 'Envoyer le brouillon',
    description:
      "Envoie le document rédigé à DocMate. L'auteur le relit et le corrige dans DocMate, qui écrit ensuite le document (front matter compris) et les médias dans son site : n'écris pas ces fichiers toi-même. Un média s'insère dans body par [[media:ID]], seul sur sa ligne.",
    inputSchema: DRAFT_SCHEMA,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
];
const TIMEOUT = { transcribe: 30 * 60_000, get_images: 120_000 };

const STEPS = `1. Appelle get_session et suis ses consignes de rédaction.
2. S'il signale des narrations non transcrites, appelle transcribe.
3. Appelle get_timeline, puis regarde les images avec get_images (toutes les photos et captures, et les images clés des vidéos).
4. Rédige le document, puis envoie-le avec submit_draft. Si DocMate le refuse, corrige et renvoie-le.`;

const INSTRUCTIONS = `DocMate capture une session d'atelier (webcams, photos, captures d'écran, narration horodatée) dans le navigateur de l'auteur. Ces outils servent à rédiger la documentation de la session en cours :
${STEPS}
L'auteur relit le brouillon dans DocMate, qui l'écrit ensuite dans son site.`;

const PROMPTS = [
  {
    name: 'rediger',
    title: 'Rédiger la doc DocMate',
    description: 'Rédige la documentation de la session DocMate en cours',
    arguments: [{ name: 'consignes', description: 'Consignes en plus (facultatif)', required: false }],
  },
];

function getPrompt({ name, arguments: args = {} } = {}) {
  if (name !== 'rediger') throw rpcError(-32602, `Prompt inconnu : ${name}`);
  const extra = args.consignes?.trim() ? `\n\nConsignes en plus : ${args.consignes.trim()}` : '';
  return {
    description: PROMPTS[0].description,
    messages: [{ role: 'user', content: { type: 'text', text: `Rédige la documentation de ma session DocMate en cours.\n\n${STEPS}${extra}` } }],
  };
}

// ---------- Demandes à l'onglet (directement, ou via le relais) ----------
let tab = null; // onglet DocMate, quand ce serveur est le relais
let upstream = null; // relais, quand un autre serveur a ouvert le port
const pending = new Map(); // id -> {resolve, reject, timer}
const routes = new Map(); // id d'une demande transmise pour un autre serveur -> sa connexion
let seq = 0;

function ask(method, params, ms = 60_000) {
  const link = tab || (upstream?.readyState === WebSocket.OPEN ? upstream : null);
  if (!link) return Promise.reject(new Error(NOT_CONNECTED));
  const id = `${process.pid}-${++seq}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("DocMate n'a pas répondu à temps."));
    }, ms);
    pending.set(id, { resolve, reject, timer });
    link.send(JSON.stringify({ id, method, params }));
  });
}

function settle({ id, result, error }) {
  const p = pending.get(id);
  if (!p) return false;
  clearTimeout(p.timer);
  pending.delete(id);
  if (error) p.reject(new Error(error));
  else p.resolve(result);
  return true;
}

function failAll(message) {
  for (const id of [...pending.keys()]) settle({ id, error: message });
}

// ---------- Relais : serveur WebSocket sur 127.0.0.1 ----------
// /tab   : l'onglet DocMate (navigateur, Origin autorisée) ; un nouvel onglet remplace l'ancien.
// /relay : les serveurs MCP des autres outils d'IA (processus locaux, sans Origin).
function startRelay() {
  const server = createServer((req, res) => {
    res.writeHead(426, { 'Content-Type': 'text/plain; charset=utf-8' }).end('DocMate MCP : connexion WebSocket attendue.\n');
  });
  server.on('upgrade', (req, socket) => {
    const origin = req.headers.origin;
    const path = new URL(req.url, 'http://x').pathname;
    const role = path === '/tab' && origin && (ORIGINS.includes(origin) || LOCAL.test(origin)) ? 'tab' : path === '/relay' && !origin ? 'relay' : null;
    if (!role || !req.headers['sec-websocket-key']) {
      if (origin) log(`connexion refusée depuis ${origin} (DOCMATE_ORIGINS pour l'autoriser)`);
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const ws = handshake(req, socket);
    if (role === 'tab') {
      tab?.close(4001, 'remplacé par un autre onglet');
      tab = ws;
      log(`onglet DocMate connecté (${origin})`);
      ws.onmessage = (text) => {
        const msg = JSON.parse(text);
        if (settle(msg)) return;
        routes.get(msg.id)?.send(text);
        routes.delete(msg.id);
      };
      ws.onclose = () => {
        if (tab !== ws) return;
        tab = null;
        log('onglet DocMate déconnecté');
        failAll("L'onglet DocMate s'est fermé.");
        for (const [id, peer] of routes) peer.send(JSON.stringify({ id, error: "L'onglet DocMate s'est fermé." }));
        routes.clear();
      };
      ws.send(JSON.stringify({ hello: { name: 'docmate-mcp', version: VERSION } }));
    } else {
      ws.onmessage = (text) => {
        const msg = JSON.parse(text);
        if (!tab) return ws.send(JSON.stringify({ id: msg.id, error: NOT_CONNECTED }));
        routes.set(msg.id, ws);
        tab.send(text);
      };
      ws.onclose = () => {
        for (const [id, peer] of routes) if (peer === ws) routes.delete(id);
      };
    }
  });
  server.once('error', (e) => {
    if (e.code === 'EADDRINUSE') joinRelay();
    else log(e.message);
  });
  server.listen(PORT, '127.0.0.1', () => log(`relais en écoute sur ws://127.0.0.1:${PORT}`));
}

// Le port est pris : on se branche sur le relais. S'il disparaît, on reprend sa place (ou celle du suivant).
let warned = false;
function joinRelay() {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/relay`);
  ws.onopen = () => {
    upstream = ws;
    warned = false;
    log(`branché sur le relais du port ${PORT}`);
  };
  ws.onmessage = (e) => settle(JSON.parse(e.data));
  ws.onerror = () => {
    if (!warned) log(`port ${PORT} occupé par un autre programme ? (DOCMATE_PORT pour en changer)`);
    warned = true;
  };
  ws.onclose = () => {
    if (upstream === ws) upstream = null;
    failAll('Liaison avec le relais DocMate perdue, réessayez.');
    setTimeout(startRelay, 300 + Math.random() * 700);
  };
}

// Côté serveur du protocole WebSocket (RFC 6455) : messages texte, ping, fermeture.
function handshake(req, socket) {
  const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);
  let closed = false;
  let buf = Buffer.alloc(0);
  let parts = [];
  const frame = (op, data) => {
    if (closed) return;
    const n = data.length;
    const head = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255]) : Buffer.alloc(10);
    if (n >= 65536) {
      head[0] = 0x80 | op;
      head[1] = 127;
      head.writeBigUInt64BE(BigInt(n), 2);
    }
    socket.write(Buffer.concat([head, data]));
  };
  const ws = {
    onmessage: () => {},
    onclose: () => {},
    send: (text) => frame(1, Buffer.from(text)),
    close(code = 1000, reason = '') {
      const b = Buffer.alloc(2);
      b.writeUInt16BE(code);
      frame(8, Buffer.concat([b, Buffer.from(reason)]));
      closed = true;
      socket.end();
    },
  };
  socket.on('data', (chunk) => {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    while (buf.length >= 2) {
      const fin = buf[0] & 0x80;
      const op = buf[0] & 0x0f;
      let n = buf[1] & 0x7f;
      let off = 2;
      if (n === 126) {
        if (buf.length < 4) return;
        n = buf.readUInt16BE(2);
        off = 4;
      } else if (n === 127) {
        if (buf.length < 10) return;
        n = Number(buf.readBigUInt64BE(2));
        off = 10;
      }
      const masked = buf[1] & 0x80;
      if (buf.length < off + (masked ? 4 : 0) + n) return;
      const mask = masked ? buf.subarray(off, off + 4) : null;
      if (masked) off += 4;
      const data = Buffer.from(buf.subarray(off, off + n));
      if (mask) for (let i = 0; i < n; i++) data[i] ^= mask[i & 3];
      buf = buf.subarray(off + n);
      if (op === 8) return ws.close();
      if (op === 9) { frame(10, data); continue; }
      if (op === 10) continue;
      parts.push(data);
      if (!fin) continue;
      const text = Buffer.concat(parts).toString('utf8');
      parts = [];
      try {
        ws.onmessage(text);
      } catch (e) {
        log('message illisible', e.message);
      }
    }
  });
  socket.on('close', () => {
    closed = true;
    ws.onclose();
  });
  socket.on('error', () => {});
  return ws;
}

// ---------- MCP sur stdio (JSON-RPC, un message par ligne) ----------
const rpcError = (code, message) => Object.assign(new Error(message), { code });

async function callTool({ name, arguments: args = {} } = {}) {
  if (!TOOLS.some((t) => t.name === name)) throw rpcError(-32602, `Outil inconnu : ${name}`);
  try {
    return await ask(name, args, TIMEOUT[name]);
  } catch (e) {
    return { content: [{ type: 'text', text: e.message }], isError: true };
  }
}

const METHODS = {
  initialize: ({ protocolVersion } = {}) => ({
    protocolVersion: PROTOCOLS.includes(protocolVersion) ? protocolVersion : PROTOCOLS[0],
    capabilities: { tools: {}, prompts: {} },
    serverInfo: { name: 'docmate', title: 'DocMate', version: VERSION },
    instructions: INSTRUCTIONS,
  }),
  ping: () => ({}),
  'tools/list': () => ({ tools: TOOLS }),
  'tools/call': callTool,
  'prompts/list': () => ({ prompts: PROMPTS }),
  'prompts/get': getPrompt,
};

const out = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');

async function handle(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return out({ id: null, error: { code: -32700, message: 'JSON illisible' } });
  }
  if (msg.id === undefined || !msg.method) return; // notification, ou réponse à une demande que l'on n'a pas faite
  const fn = METHODS[msg.method];
  if (!fn) return out({ id: msg.id, error: { code: -32601, message: `Méthode inconnue : ${msg.method}` } });
  try {
    out({ id: msg.id, result: await fn(msg.params) });
  } catch (e) {
    out({ id: msg.id, error: { code: e.code || -32603, message: e.message } });
  }
}

createInterface({ input: process.stdin })
  .on('line', (line) => line.trim() && handle(line))
  .on('close', () => process.exit(0));

startRelay();

// Rédaction par l'outil d'IA de l'utilisateur : client MCP (comme Claude Desktop) ⇄ mcp/server.mjs ⇄ onglet.
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { open, addCamera, count, initialSettings, collectErrors } from './helpers.mjs';

const PORT = 8792;

// Client MCP minimal sur stdio : lance le serveur comme le ferait un outil d'IA.
class Client {
  constructor() {
    this.proc = spawn(process.execPath, ['mcp/server.mjs'], { env: { ...process.env, DOCMATE_PORT: String(PORT) } });
    this.waiting = new Map();
    this.seq = 0;
    this.log = '';
    this.proc.stderr.on('data', (d) => (this.log += d));
    createInterface({ input: this.proc.stdout }).on('line', (line) => {
      const msg = JSON.parse(line);
      this.waiting.get(msg.id)?.(msg);
      this.waiting.delete(msg.id);
    });
  }
  request(method, params) {
    const id = ++this.seq;
    this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    return new Promise((resolve) => this.waiting.set(id, resolve));
  }
  async start() {
    await expect.poll(() => this.log).toMatch(/relais|branché/);
    const init = await this.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
    this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    return init.result;
  }
  async call(name, args = {}) {
    return (await this.request('tools/call', { name, arguments: args })).result;
  }
  stop() {
    this.proc.kill();
  }
}

const textOf = (r) => r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');

let clients = [];
test.afterEach(() => {
  clients.forEach((c) => c.stop());
  clients = [];
});

async function setup(page) {
  await initialSettings(page, { v: 2, agent: { provider: 'mcp', mcpPort: PORT }, transcription: { provider: 'none' } });
  await open(page);
  await addCamera(page);
  await page.click('#btn-photo');
  await page.fill('#note-input', 'Serrage des vis M3 au couple');
  await page.press('#note-input', 'Enter');
  await expect(count(page)).toHaveText('2');
}

test("un outil d'IA rédige la doc par MCP, l'auteur la relit dans DocMate", async ({ page }) => {
  const errors = collectErrors(page);
  const ai = new Client();
  clients.push(ai);
  const init = await ai.start();
  expect(init.serverInfo.name).toBe('docmate');
  const { tools } = (await ai.request('tools/list')).result;
  expect(tools.map((t) => t.name)).toEqual(['get_session', 'get_timeline', 'get_images', 'transcribe', 'submit_draft']);

  await setup(page);
  // Avant la connexion : l'outil d'IA explique quoi faire.
  expect(textOf(await ai.call('get_session'))).toMatch(/pas connecté/);

  // Ouvrir « Générer la doc » branche l'onglet.
  await page.click('#btn-generate');
  await expect(page.locator('#btn-run')).toHaveText(/Rédiger avec mon IA/);
  await expect(page.locator('#mcp-status')).toHaveClass(/ok/);
  await expect(page.locator('#st-mcp')).toHaveText('IA connectée');

  const session = textOf(await ai.call('get_session'));
  expect(session).toMatch(/1 photo\(s\), 1 note\(s\) écrite\(s\)/);
  expect(session).toMatch(/Consignes de rédaction/);

  const timeline = textOf(await ai.call('get_timeline'));
  expect(timeline).toMatch(/NOTE ÉCRITE : Serrage des vis M3 au couple/);
  const photoId = timeline.match(/image : (\S+)/)[1];

  const images = await ai.call('get_images', { refs: [photoId, 'inconnu'] });
  const img = images.content.find((c) => c.type === 'image');
  expect(img.mimeType).toBe('image/jpeg');
  expect(img.data.length).toBeGreaterThan(1000);
  expect(textOf(images)).toMatch(/inconnu : aucune image/);

  // Brouillon incorrect : refusé avec la raison, pour que l'IA corrige.
  const draft = {
    title: 'Serrage des vis', slug: 'serrage-des-vis', description: 'Montage.', state: 'OK', next_step: '',
    body: `Je serre les vis M3.\n\n[[media:${photoId}]]\n`,
    media: [{ id: photoId, filename: 'vis-m3', alt: 'Vis M3', caption: 'Serrage' }],
  };
  const refused = await ai.call('submit_draft', { ...draft, body: draft.body + '\n[[media:zzz]]\n' });
  expect(refused.isError).toBe(true);
  expect(textOf(refused)).toMatch(/médias inconnus dans body : zzz/);

  // Brouillon accepté : il s'affiche pour relecture, même dialogue fermé.
  await page.keyboard.press('Escape');
  await expect(page.locator('#dlg-gen')).not.toBeVisible();
  const ok = await ai.call('submit_draft', draft);
  expect(ok.isError).toBeFalsy();
  await expect(page.locator('#dlg-gen')).toBeVisible();
  await expect(page.locator('#d-title')).toHaveValue('Serrage des vis');
  await expect(page.locator('#d-body')).toHaveValue(draft.body);
  await expect(page.locator('#d-media figure')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("deux outils d'IA à la fois : le second passe par le premier, puis prend le relais", async ({ page }) => {
  const first = new Client();
  clients.push(first);
  await first.start();
  const second = new Client();
  clients.push(second);
  await second.start();
  expect(second.log).toMatch(/branché sur le relais/);

  await setup(page);
  await page.click('#btn-generate');
  await expect(page.locator('#mcp-status')).toHaveClass(/ok/);
  expect(textOf(await second.call('get_session'))).toMatch(/1 photo/);

  // Le premier outil se ferme : le second ouvre le port, l'onglet s'y rebranche.
  first.stop();
  await expect(page.locator('#mcp-status')).toHaveClass(/warn/);
  await expect(page.locator('#mcp-status')).toHaveClass(/ok/, { timeout: 15_000 });
  expect(second.log).toMatch(/relais en écoute/);
  expect(textOf(await second.call('get_session'))).toMatch(/1 photo/);
});

test('une page d\'une autre adresse ne peut pas se faire passer pour DocMate', async () => {
  const ai = new Client();
  clients.push(ai);
  await ai.start();
  const status = await new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/tab`, { headers: { Origin: 'https://exemple.com' } });
    ws.onopen = () => resolve('ouvert');
    ws.onerror = () => resolve('refusé');
  });
  expect(status).toBe('refusé');
  expect(ai.log).toMatch(/refusée depuis https:\/\/exemple\.com/);
});

test('anciens réglages sans clé : MCP et Whisper local ; avec une clé : choix gardé', async ({ page }) => {
  await page.goto('/phone.html'); // même origine, sans démarrer l'application
  const read = (stored) => page.evaluate(async (s) => {
    localStorage.setItem('docmate.settings', JSON.stringify(s));
    const { S } = await import(`/js/core/settings.js?${Math.random()}`);
    return [S.agent.provider, S.transcription.provider];
  }, stored);
  expect(await read({ agent: { provider: 'anthropic' }, transcription: { provider: 'openai' } })).toEqual(['mcp', 'local']);
  expect(await read({ agent: { provider: 'anthropic', anthropicKey: 'sk-ant-x' }, transcription: { provider: 'openai', openaiKey: 'sk-x' } })).toEqual(['anthropic', 'openai']);
  expect(await read({ v: 2, agent: { provider: 'anthropic' }, transcription: { provider: 'openai' } })).toEqual(['anthropic', 'openai']);
});

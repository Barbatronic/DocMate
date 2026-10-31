// Dialogue « Générer la doc » : rédaction par l'IA (puis relecture, écriture dans le site ou ZIP), ou
// export de la session pour un agent de code (Claude Code, Codex CLI…).
// Avec le fournisseur « MCP », c'est l'outil d'IA de l'utilisateur qui rédige (ai/mcp.js) : le dialogue
// explique quoi lui demander, et le brouillon qu'il envoie s'affiche ici pour relecture.
import { F } from '../core/features.js';
import { S, save, profile } from '../core/settings.js';
import { t } from '../core/i18n.js';
import { on } from '../core/bus.js';
import { $, esc, toast } from '../core/dom.js';
import { getHandle, putHandle } from '../core/store.js';
import { state, updateSession, blobUrl, thumbOf } from '../session/session.js';
import { transcribeAll } from '../session/transcription.js';
import { draft } from '../ai/agent.js';
import { mcp, connectMcp, initMcp } from '../ai/mcp.js';
import { assemble, writeToDir, downloadZip, ensurePermission, listProjects, recentDocs } from '../output/export.js';
import { fill, slugify } from '../output/profiles.js';
import { buildHandoff, writeHandoffToDir, downloadHandoffZip } from '../output/handoff.js';
import { fillProfileSelect } from './settings-dialog.js';

let siteHandle = null;
let lastDraft = null; // brouillon de la session courante, gardé si on referme le dialogue

// ---------- Dossier du site ----------
function renderSite() {
  $('#site-label').textContent = !F.dirWrite ? t('gen.siteHintZip') : siteHandle ? t('gen.site', { name: siteHandle.name }) : t('gen.noSite');
}

async function siteReadable() {
  return !!siteHandle && (await siteHandle.queryPermission({ mode: 'readwrite' })) === 'granted';
}

async function pickSite() {
  try {
    siteHandle = await window.showDirectoryPicker({ id: 'docmate-site', mode: 'readwrite' });
    await putHandle('site', siteHandle);
    renderSite();
    fillProjects();
  } catch { /* annulé */ }
}

async function fillProjects() {
  const items = (await siteReadable()) ? await listProjects(siteHandle, profile().projectsDir) : [];
  $('#gen-projects').innerHTML = items.map((x) => `<option value="${esc(x.slug)}">${esc(x.title)}</option>`).join('');
}

// Docs récentes du même projet dans le site : modèles de style pour l'IA.
async function siteExamples() {
  if (!(await siteReadable())) return [];
  const vars = { project: slugify(state.session.project || '') || 'divers', date: '', slug: '' };
  const folder = fill(profile().docPath, vars).split('/').slice(0, -1).join('/');
  return folder && !folder.includes('{') ? recentDocs(siteHandle, folder, 3) : [];
}

// ---------- Outil d'IA de l'utilisateur (MCP) ----------
const mcpMode = () => S.agent.provider === 'mcp';

function renderMcp() {
  const pill = $('#mcp-status');
  pill.className = 'pill ' + (mcp.connected ? 'ok' : 'warn');
  pill.textContent = t(mcp.connected ? 'mcp.on' : mcp.replaced ? 'mcp.replaced' : 'mcp.off');
}

async function runMcp() {
  if (!state.events.length) return toast(t('gen.empty'));
  await saveFields();
  connectMcp();
  $('#mcp-help').hidden = false;
  $('#mcp-setup').open ||= !mcp.connected;
  // Narrations transcrites d'avance : l'IA n'a plus qu'à lire (elle peut aussi le demander elle-même).
  if (S.transcription.provider !== 'none') {
    await busy(async () => {
      try { await transcribeWithLog(); } catch (e) { log('⚠ ' + (e.message || e)); }
    });
  }
}

async function receiveDraft(d) {
  lastDraft = d;
  if (!$('#dlg-gen').open) await open();
  showDraft(d);
  log(t('gen.mcpReceived'));
  toast('✓ ' + t('gen.mcpReceived'), 6000);
}

// ---------- Journal ----------
function log(msg) {
  const el = $('#gen-log');
  el.hidden = false;
  el.textContent += msg + '\n';
  el.scrollTop = el.scrollHeight;
}

// Progression (« Modèle xxx.onnx 42 % ») : la ligne du même fichier se met à jour au lieu de s'empiler.
function logProgress(msg) {
  const el = $('#gen-log');
  const lines = el.textContent.split('\n');
  const key = (l) => l.replace(/\d+ %$/, '');
  if (/\d+ %$/.test(msg) && lines.length >= 2 && key(lines.at(-2)) === key(msg)) {
    lines[lines.length - 2] = msg;
    el.textContent = lines.join('\n');
    el.scrollTop = el.scrollHeight;
  } else {
    log(msg);
  }
}

function transcribeWithLog() {
  let last = '';
  return transcribeAll({
    onSegment: (i, n) => log(t('gen.transcribing', { i, n })),
    onProgress: (p) => { if (p !== last) { last = p; logProgress('  ' + p); } },
  });
}

// ---------- Génération ----------
async function open() {
  const s = state.session;
  fillProfileSelect($('#gen-profile'));
  $('#gen-project').value = s.project || '';
  $('#gen-title').value = s.title || '';
  $('#gen-instructions').value = s.instructions || '';
  const audio = state.events.filter((e) => e.type === 'audio').length;
  $('#gen-summary').textContent = t('gen.summary', { n: state.events.length, a: audio });
  $('#gen-log').hidden = true;
  $('#gen-result').hidden = !lastDraft;
  $('#btn-run span').textContent = t(mcpMode() ? 'gen.runMcp' : 'gen.run');
  $('#mcp-help').hidden = !mcpMode() || !!lastDraft;
  if (mcpMode()) {
    connectMcp();
    renderMcp();
  }
  renderSite();
  $('#dlg-gen').showModal();
  if (siteHandle && !(await siteReadable())) {
    try { await ensurePermission(siteHandle); } catch { /* refus */ }
  }
  fillProjects();
}

async function saveFields() {
  await updateSession({
    project: slugify($('#gen-project').value) === 'doc' ? '' : $('#gen-project').value.trim(),
    title: $('#gen-title').value.trim(),
    instructions: $('#gen-instructions').value.trim(),
  });
  $('#gen-log').textContent = '';
  $('#gen-result').hidden = true;
  $('#handoff-result').hidden = true;
  $('#mcp-help').hidden = true;
}

async function busy(fn) {
  $('#btn-run').disabled = $('#btn-handoff').disabled = true;
  try {
    await fn();
  } catch (e) {
    log('✗ ' + (e.message || e));
    console.error(e);
  } finally {
    $('#btn-run').disabled = $('#btn-handoff').disabled = false;
  }
}

async function runGeneration() {
  if (mcpMode()) return runMcp();
  if (!state.events.length) return toast(t('gen.empty'));
  await saveFields();
  await busy(async () => {
    // 1. Transcription des narrations qui ne l'ont pas encore été.
    await transcribeWithLog();
    // 2. Exemples de style : docs récentes du même projet dans le site.
    const extra = await siteExamples();
    if (extra.length) log(t('gen.examplesAuto', { n: extra.length }));
    // 3. Rédaction.
    let lastP = '';
    lastDraft = await draft(state.session, state.events, (p) => {
      if (p.startsWith('Rédaction…') || p.startsWith('Préparation')) { $('#gen-summary').textContent = p; return; }
      if (p !== lastP) { lastP = p; log(p); }
    }, extra);
    showDraft(lastDraft);
    log(t('gen.done'));
  });
}

// Export pour un agent de code : rédaction avec un abonnement, sans clé API.
async function runHandoff() {
  if (!state.events.length) return toast(t('gen.empty'));
  await saveFields();
  await busy(async () => {
    if (S.transcription.provider !== 'none') {
      try { await transcribeWithLog(); } catch (e) { log('⚠ ' + (e.message || e) + ' · ' + t('gen.handoffNoStt')); }
    }
    const h = await buildHandoff(profile(), state.session, state.events, (p) => log(p));
    if (F.dirWrite && siteHandle && (await ensurePermission(siteHandle))) {
      await writeHandoffToDir(siteHandle, h);
      $('#handoff-where').textContent = t('gen.handoffWritten', { path: `${siteHandle.name}/${h.folder}/` });
    } else {
      await downloadHandoffZip(h);
      $('#handoff-where').textContent = t('gen.handoffZip', { path: h.folder });
    }
    $('#handoff-prompt').textContent = h.prompt;
    $('#handoff-result').hidden = false;
    log(t('gen.handoffDone', { n: h.files.length }));
  });
}

// ---------- Brouillon : relecture, puis écriture ----------
function showDraft(d) {
  $('#d-title').value = d.title;
  $('#d-slug').value = d.slug;
  $('#d-state').value = d.state;
  $('#d-description').value = d.description;
  $('#d-next').value = d.next_step;
  $('#d-body').value = d.body;
  const strip = $('#d-media');
  strip.innerHTML = '';
  for (const m of d.media) {
    const ev = state.events.find((e) => e.id === m.id);
    if (!ev) continue;
    const fig = document.createElement('figure');
    fig.innerHTML = `<img alt=""><figcaption><code>${esc(m.id)}</code> ${esc(m.filename)}<br>${esc(m.caption)}</figcaption>`;
    blobUrl(thumbOf(ev)).then((u) => ($('img', fig).src = u));
    strip.append(fig);
  }
  $('#gen-result').hidden = false;
  $('#gen-done').hidden = true;
  $('#mcp-help').hidden = true;
}

const editedDraft = () => ({
  ...lastDraft,
  title: $('#d-title').value,
  slug: $('#d-slug').value,
  state: $('#d-state').value,
  description: $('#d-description').value,
  next_step: $('#d-next').value,
  body: $('#d-body').value,
});

function done(title, paths) {
  const el = $('#gen-done');
  el.hidden = false;
  el.textContent = title + '\n' + paths.map((p) => '  ' + p).join('\n');
}

async function write() {
  try {
    if (!siteHandle) await pickSite();
    if (!siteHandle || !(await ensurePermission(siteHandle))) return;
    const a = await assemble(profile(), state.session, state.events, editedDraft(), siteHandle);
    done(t('gen.written'), await writeToDir(siteHandle, a, profile()));
  } catch (e) {
    done('✗', [e.message || String(e)]);
  }
}

async function zip() {
  try {
    const a = await assemble(profile(), state.session, state.events, editedDraft());
    done(t('gen.zipped'), await downloadZip(a));
  } catch (e) {
    done('✗', [e.message || String(e)]);
  }
}

export function initGenerateDialog() {
  $('#btn-generate').onclick = open;
  $('#btn-site').onclick = pickSite;
  $('#gen-profile').onchange = (e) => { S.profileId = e.target.value; save(); fillProjects(); };
  $('#btn-run').onclick = runGeneration;
  $('#btn-regen').onclick = runGeneration;
  $('#btn-handoff').onclick = runHandoff;
  $('#btn-write').onclick = write;
  $('#btn-zip').onclick = zip;
  $('#btn-copy-prompt').onclick = () => copy($('#handoff-prompt').textContent);
  $('#btn-copy-mcp').onclick = () => copy($('#mcp-prompt').textContent);
  on('session', () => (lastDraft = null));
  on('mcp', renderMcp);
}

async function copy(text) {
  await navigator.clipboard.writeText(text);
  toast('📋 ' + t('gen.copied'));
}

export async function bootGenerateDialog() {
  try { siteHandle = (await getHandle('site')) || null; } catch { /* pas de poignée */ }
  initMcp({ examples: siteExamples, onDraft: receiveDraft });
}

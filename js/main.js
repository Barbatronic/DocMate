// DocMate : contrôleur de la page principale.
import { F, capabilityReport } from './features.js';
import { t, applyI18n } from './i18n.js';
import { S, save, profile, resetProfiles } from './settings.js';
import * as db from './store.js';
import { CameraTile, Narrator, ScreenWatcher, ScreenShare, importFiles, videoThumb } from './media.js';
import { PhoneLink } from './phonelink.js';
import { transcribe } from './transcribe.js';
import { draft } from './agent.js';
import { assemble, writeToDir, downloadZip, ensurePermission, listProjects, recentDocs } from './export.js';
import { fill, slugify, exportProfile, importProfile } from './profiles.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const hhmmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');
};
const toast = (msg, ms = 4000) => {
  const el = Object.assign(document.createElement('div'), { className: 'toast', textContent: msg });
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
};

applyI18n();
db.persist();

// ---------- État ----------
let session = null;   // session courante (active ou ouverte pour génération)
let events = [];
const tiles = [];
const urls = new Map(); // blobId -> object URL
let siteHandle = null;
let shotsHandle = null;
let lastDraft = null;

const narrator = new Narrator((ev, b) => sink(ev, b), (lvl) => $('#btn-narrate .level i').style.setProperty('--lvl', lvl));
const watcher = new ScreenWatcher((ev, b) => sink(ev, b));
const share = new ScreenShare((ev, b) => sink(ev, b));
const phone = new PhoneLink({
  onEvent: (ev, b) => sink(ev, b),
  onStream: (stream, label) => addTile({ remote: stream, label }),
  onStatus: (s) => ($('#phone-status').textContent = s),
});

// ---------- Bandeau des capacités ----------
(function banner() {
  const r = capabilityReport(t);
  const el = $('#banner');
  el.hidden = false;
  if (r.ok) {
    el.className = 'banner ok';
    el.textContent = t('cap.ok');
    setTimeout(() => (el.hidden = true), 5000);
  } else {
    el.className = 'banner warn';
    el.innerHTML = `<b>${esc(t('cap.limited'))}</b> ${r.missing.map(esc).join(' · ')}. <span>${esc(t('cap.advice'))}</span> <button class="btn ghost small">✕</button>`;
    $('button', el).onclick = () => (el.hidden = true);
  }
  if (!F.pip) $('#btn-pip').hidden = true;
  if (!F.dirWrite) { $('#btn-write').hidden = true; $('#btn-site').hidden = true; $('#btn-shots').disabled = true; }
})();

// ---------- Sessions ----------
async function startSession() {
  session = { id: db.uid('s'), started: Date.now(), ended: null, title: '', project: '', instructions: '' };
  events = [];
  await db.putSession(session);
  localStorage.setItem('docmate.active', session.id);
  await startShotWatch();
  renderSession();
  renderTimeline();
}

async function stopSession() {
  if (!session) return;
  narrator.stop();
  await Promise.all(tiles.map((tl) => tl.stopClip()));
  watcher.stop();
  session.ended = Date.now();
  await db.putSession(session);
  localStorage.removeItem('docmate.active');
  renderSession();
}

async function openSession(id, resume = false) {
  session = await db.getSession(id);
  events = await db.listEvents(id);
  if (resume) {
    session.ended = null;
    await db.putSession(session);
    localStorage.setItem('docmate.active', session.id);
    await startShotWatch();
  }
  renderSession();
  renderTimeline();
}

const isActive = () => session && !session.ended;

async function ensureSession() {
  if (!isActive()) await startSession();
}

// Point d'entrée de toutes les captures.
async function sink(meta, { blob, keyframes, thumb } = {}) {
  await ensureSession();
  const ev = { id: db.uid(meta.type.slice(0, 2)), sessionId: session.id, text: '', ...meta };
  if (blob) ev.blobId = await db.putBlob(blob);
  if (keyframes?.length) ev.keyframes = await Promise.all(keyframes.filter(Boolean).map((k) => db.putBlob(k)));
  if ((ev.type === 'clip' || ev.type === 'phone_video') && !ev.keyframes?.length) {
    thumb ||= await videoThumb(blob);
    if (thumb) ev.thumbId = await db.putBlob(thumb);
  }
  await db.putEvent(ev);
  events.push(ev);
  events.sort((a, b) => a.t - b.t);
  renderTimeline(ev.id);
  pip.update();
  return ev;
}

async function addMarker(text = '') {
  await sink({ type: 'marker', t: Date.now(), text });
  toast('📍');
}

// ---------- Rendu ----------
function renderSession() {
  const active = isActive();
  $('#btn-session').textContent = active ? t('session.stop') : t('session.start');
  $('#btn-session').classList.toggle('danger', active);
  $('#btn-session').classList.toggle('primary', !active);
  $('#session-name').textContent = session
    ? new Date(session.started).toLocaleString() + (session.ended ? ` · ${t('session.ended')}` : '')
    : t('session.none');
  document.body.classList.toggle('live', !!active);
}

setInterval(() => {
  if (session) $('#session-timer').textContent = hhmmss((session.ended || Date.now()) - session.started);
}, 500);

function blobUrl(id) {
  if (!id) return '';
  if (!urls.has(id)) urls.set(id, db.getBlob(id).then((b) => (b ? URL.createObjectURL(b) : '')));
  return urls.get(id);
}

const ICON = { photo: '📸', phone_photo: '📱', screenshot: '🖥', clip: '🎬', phone_video: '📱', audio: '🎙', marker: '📍', note: '📝' };

function renderTimeline(flashId) {
  const ol = $('#timeline');
  $('#tl-count').textContent = events.length;
  if (!events.length) {
    ol.innerHTML = `<li class="tl-empty">${esc(t('tl.empty'))}</li>`;
    return;
  }
  ol.innerHTML = '';
  for (const ev of events) {
    const li = document.createElement('li');
    li.className = `tl-item tl-${ev.type}` + (ev.id === flashId ? ' flash' : '');
    const rel = session ? '+' + hhmmss(ev.t - session.started) : '';
    const dur = ev.tEnd ? ` · ${Math.round((ev.tEnd - ev.t) / 1000)} s` : '';
    const thumbId = ev.type.includes('photo') || ev.type === 'screenshot' ? ev.blobId : ev.keyframes?.[0] || ev.thumbId;
    li.innerHTML = `
      <div class="tl-thumb">${thumbId ? '<img alt="">' : `<span>${ICON[ev.type] || '•'}</span>`}</div>
      <div class="tl-body">
        <div class="tl-meta"><b>${esc(t('type.' + ev.type))}</b> <time>${rel}</time>${dur} <span class="src">${esc(ev.source || '')}</span></div>
        ${ev.type === 'audio' ? `<details ${ev.transcript ? '' : 'hidden'}><summary>${esc(t('tl.transcript'))}</summary><p class="transcript"></p></details>` : ''}
        <input class="tl-text" value="${esc(ev.text)}" placeholder="${esc(t('tl.captionPh'))}">
      </div>
      <button class="btn icon ghost tl-del" title="${esc(t('tl.delete'))}">✕</button>`;
    if (thumbId) blobUrl(thumbId).then((u) => ($('img', li).src = u));
    if (ev.transcript) $('.transcript', li).textContent = ev.transcript.map((s) => s.text).join(' ');
    $('.tl-thumb', li).onclick = async () => ev.blobId && window.open(await blobUrl(ev.blobId), '_blank');
    $('.tl-text', li).onchange = async (e) => { ev.text = e.target.value; await db.putEvent(ev); };
    $('.tl-del', li).onclick = async () => {
      await db.deleteEvent(ev);
      events = events.filter((x) => x !== ev);
      renderTimeline();
    };
    ol.append(li);
  }
  ol.querySelector('.flash')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ---------- Caméras ----------
let devices = [];
async function refreshDevices() {
  const all = await navigator.mediaDevices.enumerateDevices();
  devices = all.filter((d) => d.kind === 'videoinput');
  tiles.forEach((tl) => tl.fillDevices(devices));
  const mics = all.filter((d) => d.kind === 'audioinput');
  $('#mic-select').innerHTML = mics.map((m, i) => `<option value="${esc(m.deviceId)}">${esc(m.label || 'Micro ' + (i + 1))}</option>`).join('');
  $('#mic-select').value = S.capture.micId || mics[0]?.deviceId || '';
}

function saveCams() {
  S.capture.cameras = tiles.filter((tl) => !tl.remote && tl.deviceId).map((tl) => tl.deviceId);
  save();
}

async function addTile({ deviceId, remote, label } = {}) {
  const tile = new CameraTile({
    container: $('#cams'),
    sink: (ev, b) => sink(ev, b),
    deviceId,
    remote,
    label,
    onClose: (tl) => { tiles.splice(tiles.indexOf(tl), 1); saveCams(); updateCamsEmpty(); },
  });
  tiles.push(tile);
  updateCamsEmpty();
  if (remote) return tile;
  try {
    if (!deviceId) {
      const used = new Set(tiles.map((tl) => tl.deviceId));
      deviceId = devices.find((d) => d.deviceId && !used.has(d.deviceId))?.deviceId || '';
    }
    await tile.open(deviceId);
    await refreshDevices();
    saveCams();
  } catch (e) {
    toast(`${t('err.camera')} ${e.message}`, 6000);
    tile.close();
  }
  return tile;
}

function updateCamsEmpty() {
  $('#cams-empty').hidden = tiles.length > 0;
  $('#cams').dataset.n = tiles.length;
}

$('#cams').addEventListener('camchange', saveCams);

// Caméra ciblée par les raccourcis : la tuile active, sinon toutes.
const targets = () => {
  const act = tiles.filter((tl) => tl.el.classList.contains('active'));
  return act.length ? act : tiles;
};

async function photo() {
  if (!tiles.length) return toast(t('err.noCam'));
  await Promise.all(targets().map((tl) => tl.photo()));
}

async function clip() {
  if (!tiles.length) return toast(t('err.noCam'));
  const tg = targets();
  const anyRec = tg.some((tl) => tl.recording);
  await Promise.all(tg.map((tl) => (anyRec ? tl.stopClip() : tl.toggleClip())));
  $('#btn-clip').classList.toggle('rec', tiles.some((tl) => tl.recording));
  pip.update();
}

async function narrate() {
  try {
    if (narrator.active) narrator.stop();
    else { await ensureSession(); await narrator.start(); }
  } catch (e) {
    toast(`${t('err.mic')} ${e.message}`, 6000);
  }
  $('#btn-narrate').classList.toggle('rec', narrator.active);
  pip.update();
}

async function screenshot() {
  try { await share.capture(); } catch (e) { if (e.name !== 'NotAllowedError') toast(e.message); }
}

// ---------- Captures d'écran : dossier surveillé ----------
async function startShotWatch() {
  if (!shotsHandle || !session) return;
  try {
    if ((await shotsHandle.queryPermission({ mode: 'read' })) !== 'granted' &&
        (await shotsHandle.requestPermission({ mode: 'read' })) !== 'granted') return;
    await watcher.watch(shotsHandle, session.started);
  } catch (e) {
    console.warn(e);
  }
}

function renderShots() {
  $('#shots-label').textContent = shotsHandle ? t('set.shots', { name: shotsHandle.name }) : t('set.noShots');
}

$('#btn-shots').onclick = async () => {
  try {
    shotsHandle = await window.showDirectoryPicker({ id: 'docmate-shots', mode: 'read', startIn: 'pictures' });
    await db.putHandle('shots', shotsHandle);
    renderShots();
    if (isActive()) await startShotWatch();
  } catch { /* annulé */ }
};

// ---------- Glisser-déposer ----------
let dragDepth = 0;
addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; $('#drop-overlay').hidden = false; } });
addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#drop-overlay').hidden = true; } });
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  $('#drop-overlay').hidden = true;
  if (e.dataTransfer?.files.length) await importFiles(e.dataTransfer.files, (ev, b) => sink(ev, b));
});
// Coller une image (Ctrl+V) : utile pour les captures copiées dans le presse-papiers.
addEventListener('paste', async (e) => {
  if (e.target.closest('input, textarea')) return;
  const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image'));
  if (files.length) await importFiles(files.map((f) => new File([f], f.name || 'presse-papiers.png', { type: f.type, lastModified: Date.now() })), (ev, b) => sink(ev, b));
});

// ---------- Barre flottante (Document Picture-in-Picture) ----------
const pip = {
  win: null,
  async open() {
    if (!F.pip) return toast(t('pip.unavailable'));
    if (this.win) return this.win.focus();
    this.win = await documentPictureInPicture.requestWindow({ width: 340, height: 64 });
    const d = this.win.document;
    $$('link[rel=stylesheet]').forEach((l) => d.head.append(Object.assign(d.createElement('link'), { rel: 'stylesheet', href: l.href })));
    d.body.className = 'pip';
    d.body.innerHTML = `
      <button data-a="photo" class="btn">📸</button>
      <button data-a="clip" class="btn">⏺</button>
      <button data-a="marker" class="btn">📍</button>
      <button data-a="narrate" class="btn">🎙</button>
      <button data-a="screen" class="btn">🖥</button>
      <span class="pip-count"></span>`;
    const act = { photo, clip, marker: () => addMarker(), narrate, screen: screenshot };
    d.body.onclick = (e) => { const a = e.target.closest('[data-a]')?.dataset.a; if (a) act[a](); };
    this.win.addEventListener('pagehide', () => (this.win = null));
    this.update();
  },
  update() {
    if (!this.win) return;
    const d = this.win.document;
    d.querySelector('[data-a=clip]')?.classList.toggle('rec', tiles.some((tl) => tl.recording));
    d.querySelector('[data-a=narrate]')?.classList.toggle('rec', narrator.active);
    const c = d.querySelector('.pip-count');
    if (c) c.textContent = events.length;
  },
};

// ---------- Boutons et raccourcis ----------
$('#btn-session').onclick = () => (isActive() ? stopSession() : startSession());
$('#btn-photo').onclick = photo;
$('#btn-clip').onclick = clip;
$('#btn-marker').onclick = () => addMarker();
$('#btn-narrate').onclick = narrate;
$('#btn-screen').onclick = screenshot;
$('#btn-pip').onclick = () => pip.open();
$('#btn-add-cam').onclick = () => addTile();
$('#note-form').onsubmit = async (e) => {
  e.preventDefault();
  const text = $('#note-input').value.trim();
  if (!text) return;
  $('#note-input').value = '';
  await sink({ type: 'note', t: Date.now(), text });
};

addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input, textarea, select, dialog[open]')) return;
  const k = e.key.toLowerCase();
  const map = { p: photo, v: clip, m: () => addMarker(), n: narrate, s: screenshot };
  if (map[k]) { e.preventDefault(); map[k](); }
});

addEventListener('beforeunload', (e) => {
  if (narrator.active || tiles.some((tl) => tl.recording)) e.preventDefault();
});

// ---------- Téléphone ----------
$('#btn-phone').onclick = async () => {
  $('#dlg-phone').showModal();
  try {
    await phone.start();
    const url = phone.phoneUrl;
    $('#phone-url').href = url;
    $('#phone-url').textContent = url;
    const { default: qrcode } = await import('https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/+esm');
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    $('#qr').innerHTML = qr.createSvgTag({ cellSize: 5, margin: 3, scalable: true });
  } catch (e) {
    $('#phone-status').textContent = e.message || String(e);
  }
};

// ---------- Sessions (liste) ----------
$('#btn-sessions').onclick = async () => {
  const list = await db.listSessions();
  const ul = $('#sessions-list');
  ul.innerHTML = list.length ? '' : `<li class="hint">${esc(t('session.empty'))}</li>`;
  for (const s of list) {
    const li = document.createElement('li');
    const n = (await db.listEvents(s.id)).length;
    li.innerHTML = `<div><b>${esc(new Date(s.started).toLocaleString())}</b>
      <span class="hint">${esc(s.title || s.project || '')} · ${n} ${esc(t('session.items'))}${s.ended ? '' : ' · ●'}</span></div>
      <div class="row"><button class="btn small" data-a="open">${esc(t('session.open'))}</button>
      <button class="btn small" data-a="resume">${esc(t('session.resume'))}</button>
      <button class="btn small ghost" data-a="del">${esc(t('session.delete'))}</button></div>`;
    li.onclick = async (e) => {
      const a = e.target.dataset.a;
      if (a === 'open' || a === 'resume') {
        if (isActive() && session.id !== s.id) await stopSession();
        await openSession(s.id, a === 'resume');
        $('#dlg-sessions').close();
      } else if (a === 'del' && confirm(t('session.confirmDelete'))) {
        await db.deleteSession(s.id);
        if (session?.id === s.id) { session = null; events = []; renderSession(); renderTimeline(); }
        li.remove();
      }
    };
    ul.append(li);
  }
  $('#dlg-sessions').showModal();
};

// ---------- Génération ----------
function renderSite() {
  $('#site-label').textContent = !F.dirWrite ? t('gen.siteHintZip') : siteHandle ? t('gen.site', { name: siteHandle.name }) : t('gen.noSite');
}

async function siteReadable() {
  if (!siteHandle) return false;
  return (await siteHandle.queryPermission({ mode: 'readwrite' })) === 'granted';
}

async function fillProjects() {
  const p = profile();
  const items = (await siteReadable()) ? await listProjects(siteHandle, p.projectsDir) : [];
  $('#gen-projects').innerHTML = items.map((x) => `<option value="${esc(x.slug)}">${esc(x.title)}</option>`).join('');
}

function fillProfileSelect(sel) {
  sel.innerHTML = S.profiles.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  sel.value = S.profileId;
}

$('#btn-generate').onclick = async () => {
  if (!session) { toast(t('gen.empty')); return; }
  fillProfileSelect($('#gen-profile'));
  $('#gen-project').value = session.project || '';
  $('#gen-title').value = session.title || '';
  $('#gen-instructions').value = session.instructions || '';
  const audio = events.filter((e) => e.type === 'audio').length;
  $('#gen-summary').textContent = t('gen.summary', { n: events.length, a: audio });
  $('#gen-log').hidden = true;
  $('#gen-result').hidden = !lastDraft || lastDraft.sessionId !== session.id;
  renderSite();
  $('#dlg-gen').showModal();
  if (siteHandle && !(await siteReadable())) {
    try { await ensurePermission(siteHandle); } catch { /* refus */ }
  }
  fillProjects();
};

$('#gen-profile').onchange = (e) => { S.profileId = e.target.value; save(); fillProjects(); };

$('#btn-site').onclick = async () => {
  try {
    siteHandle = await window.showDirectoryPicker({ id: 'docmate-site', mode: 'readwrite' });
    await db.putHandle('site', siteHandle);
    renderSite();
    fillProjects();
  } catch { /* annulé */ }
};

function log(msg) {
  const el = $('#gen-log');
  el.hidden = false;
  el.textContent += msg + '\n';
  el.scrollTop = el.scrollHeight;
}

async function runGeneration() {
  if (!events.length) return toast(t('gen.empty'));
  session.project = slugify($('#gen-project').value) === 'doc' ? '' : $('#gen-project').value.trim();
  session.title = $('#gen-title').value.trim();
  session.instructions = $('#gen-instructions').value.trim();
  await db.putSession(session);
  $('#gen-log').textContent = '';
  $('#gen-result').hidden = true;
  $('#btn-run').disabled = true;
  try {
    // 1. Transcription des segments pas encore transcrits.
    const audio = events.filter((e) => e.type === 'audio');
    for (const [i, ev] of audio.entries()) {
      if (ev.transcript) continue;
      log(t('gen.transcribing', { i: i + 1, n: audio.length }));
      let last = '';
      ev.transcript = await transcribe(await db.getBlob(ev.blobId), (p) => { if (p !== last) { last = p; log('  ' + p); } });
      await db.putEvent(ev);
    }
    // 2. Exemples de style : docs récentes du même projet dans le site.
    let extra = [];
    if (siteHandle && (await siteReadable())) {
      const p = profile();
      const vars = { project: slugify(session.project || '') || 'divers', date: '', slug: '' };
      const folder = fill(p.docPath, vars).split('/').slice(0, -1).join('/');
      if (folder && !folder.includes('{')) extra = await recentDocs(siteHandle, folder, 3);
      if (extra.length) log(t('gen.examplesAuto', { n: extra.length }));
    }
    // 3. Rédaction.
    let lastP = '';
    const d = await draft(session, events, (p) => {
      if (p.startsWith('Rédaction…')) { $('#gen-summary').textContent = p; return; }
      if (p !== lastP) { lastP = p; log(p); }
    }, extra);
    lastDraft = { ...d, sessionId: session.id };
    showDraft(lastDraft);
    log(t('gen.done'));
  } catch (e) {
    log('✗ ' + (e.message || e));
    console.error(e);
  } finally {
    $('#btn-run').disabled = false;
    renderTimeline();
  }
}

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
    const ev = events.find((e) => e.id === m.id);
    if (!ev) continue;
    const fig = document.createElement('figure');
    fig.innerHTML = `<img alt=""><figcaption><code>${esc(m.id)}</code> ${esc(m.filename)}<br>${esc(m.caption)}</figcaption>`;
    blobUrl(ev.type.includes('photo') || ev.type === 'screenshot' ? ev.blobId : ev.keyframes?.[0] || ev.thumbId).then((u) => ($('img', fig).src = u));
    strip.append(fig);
  }
  $('#gen-result').hidden = false;
  $('#gen-done').hidden = true;
}

function editedDraft() {
  return {
    ...lastDraft,
    title: $('#d-title').value,
    slug: $('#d-slug').value,
    state: $('#d-state').value,
    description: $('#d-description').value,
    next_step: $('#d-next').value,
    body: $('#d-body').value,
  };
}

function done(title, paths) {
  const el = $('#gen-done');
  el.hidden = false;
  el.textContent = title + '\n' + paths.map((p) => '  ' + p).join('\n');
}

$('#btn-run').onclick = runGeneration;
$('#btn-regen').onclick = runGeneration;

$('#btn-write').onclick = async () => {
  try {
    if (!siteHandle) await $('#btn-site').onclick();
    if (!siteHandle || !(await ensurePermission(siteHandle))) return;
    const a = await assemble(profile(), session, events, editedDraft());
    done(t('gen.written'), await writeToDir(siteHandle, a, profile()));
  } catch (e) {
    done('✗', [e.message || String(e)]);
  }
};

$('#btn-zip').onclick = async () => {
  try {
    const a = await assemble(profile(), session, events, editedDraft());
    done(t('gen.zipped'), await downloadZip(a));
  } catch (e) {
    done('✗', [e.message || String(e)]);
  }
};

// ---------- Réglages ----------
const getPath = (path) => path.split('.').reduce((o, k) => o?.[k], S);
const setPath = (path, v) => {
  const ks = path.split('.');
  const last = ks.pop();
  ks.reduce((o, k) => o[k], S)[last] = v;
};

function bindSettings() {
  $$('[data-k]', $('#dlg-settings')).forEach((el) => {
    const v = getPath(el.dataset.k);
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v ?? '';
    el.onchange = () => {
      const val = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
      setPath(el.dataset.k, val);
      save();
      showHide();
      if (el.dataset.k === 'lang') location.reload();
    };
  });
  showHide();
}

function showHide() {
  $$('[data-show]').forEach((el) => {
    const [k, v] = el.dataset.show.split('=');
    el.hidden = getPath(k) !== v;
  });
}

$$('.tab').forEach((b) => (b.onclick = () => {
  $$('.tab').forEach((x) => x.classList.toggle('active', x === b));
  $$('.tab-pane').forEach((p) => (p.hidden = p.dataset.pane !== b.dataset.tab));
}));

function bindProfile() {
  const sel = $('#prof-select');
  fillProfileSelect(sel);
  const p = profile();
  $$('[data-p]').forEach((el) => {
    el.value = p[el.dataset.p] ?? '';
    el.onchange = () => {
      p[el.dataset.p] = el.type === 'number' ? Number(el.value) : el.value;
      save();
      if (el.dataset.p === 'name') fillProfileSelect(sel);
    };
  });
  const ul = $('#prof-examples');
  ul.innerHTML = '';
  (p.examples || []).forEach((ex, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${esc(ex.name)}</span><button class="btn icon ghost small">✕</button>`;
    $('button', li).onclick = () => { p.examples.splice(i, 1); save(); bindProfile(); };
    ul.append(li);
  });
}

$('#prof-select').onchange = (e) => { S.profileId = e.target.value; save(); bindProfile(); };
$('#prof-dup').onclick = () => {
  const p = { ...structuredClone(profile()), id: 'custom-' + Date.now().toString(36) };
  p.name += ` (${t('set.copy')})`;
  S.profiles.push(p);
  S.profileId = p.id;
  save();
  bindProfile();
};
$('#prof-export').onclick = () => exportProfile(profile());
$('#prof-import').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const p = importProfile(await f.text());
    S.profiles.push(p);
    S.profileId = p.id;
    save();
    bindProfile();
  } catch (err) {
    toast(err.message);
  }
  e.target.value = '';
};
$('#prof-reset').onclick = () => { if (confirm(t('set.confirmReset'))) { resetProfiles(); bindProfile(); } };
$('#prof-ex-add').onchange = async (e) => {
  const p = profile();
  p.examples ||= [];
  for (const f of e.target.files) p.examples.push({ name: f.name, text: await f.text() });
  save();
  bindProfile();
  e.target.value = '';
};

$('#btn-settings').onclick = async () => {
  bindSettings();
  bindProfile();
  renderShots();
  $('#dlg-settings').showModal();
};

// ---------- Démarrage ----------
(async function init() {
  renderSession();
  renderTimeline();
  updateCamsEmpty();
  try {
    siteHandle = (await db.getHandle('site')) || null;
    shotsHandle = (await db.getHandle('shots')) || null;
  } catch { /* pas de poignées */ }
  // Reprendre la session active après un rechargement de la page.
  const active = localStorage.getItem('docmate.active');
  if (active && (await db.getSession(active))) await openSession(active, true);
  if (!F.camera) return;
  try {
    await refreshDevices();
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
    for (const id of S.capture.cameras) if (devices.some((d) => d.deviceId === id)) await addTile({ deviceId: id });
  } catch (e) {
    console.warn(e);
  }
})();

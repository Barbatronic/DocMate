// Page téléphone : se connecte au PC dont l'identifiant est dans l'URL (#docmate-....jeton).
// Télécommande du PC, micro sans fil, caméra en direct, envoi de photos, vidéos, repères et notes.
import { PEERJS, sendFile } from './protocol.js';
import { videoThumb } from '../capture/media.js';
import { applyI18n, t } from '../core/i18n.js';
import { applyIcons } from '../core/icons.js';

applyIcons();
applyI18n();
const $ = (s) => document.querySelector(s);
const [hostId, token] = location.hash.slice(1).split('.');
const status = (txt, ok) => { $('#status').textContent = txt; $('#status').classList.toggle('ok', !!ok); };
const hhmmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');
};

let peer, conn;
let denied = false;
const pendingAcks = new Map();
const pendingCmds = new Map();
// Sources de ce téléphone : flux local et appel vers le PC.
const src = { mic: { stream: null, call: null }, cam: { stream: null, call: null } };

const paired = () => !!conn?.open;

async function connect() {
  if (!hostId || !token) return status(t('phone.noHost'));
  const { Peer } = await import(PEERJS);
  peer ??= new Peer();
  peer.on('error', (e) => status(`${t('phone.error')} ${e.type}`));
  const open = () => {
    conn = peer.connect(hostId, { reliable: true });
    conn.on('open', () => {
      conn.send({ kind: 'hello', now: Date.now(), token });
      status(t('phone.connected'), true);
      setEnabled(true);
      // Après une coupure (PC rechargé, réseau), les appels en cours sont morts : on les relance.
      for (const kind of ['mic', 'cam']) if (src[kind].stream) placeCall(kind);
    });
    conn.on('data', onData);
    conn.on('close', () => {
      setEnabled(false);
      for (const r of pendingCmds.values()) r({ ok: false, error: t('phone.notConnected') });
      pendingCmds.clear();
      // Refusé (QR code périmé) : inutile de réessayer.
      if (denied) return status(t('phone.denied'));
      status(t('phone.reconnecting'));
      setTimeout(open, 2000);
    });
  };
  peer.open ? open() : peer.on('open', open);
}

function onData(m) {
  if (m.kind === 'ack') pendingAcks.get(m.id)?.();
  else if (m.kind === 'result') { pendingCmds.get(m.id)?.(m); pendingCmds.delete(m.id); }
  else if (m.kind === 'state') renderState(m);
  else if (m.kind === 'denied') denied = true;
}

function setEnabled(on) {
  document.querySelectorAll('.pad-btn[data-cmd], #p-mic, #p-live').forEach((b) => (b.disabled = !on));
  if (on && state) renderState(state);
}

// ---------- Télécommande ----------
// Le chrono est le temps de travail de la session courante du PC ; il avance pendant un enregistrement.
let state = null;
let stateAt = 0;

function renderState(s) {
  state = s;
  stateAt = Date.now();
  $('#r-dot').className = 'dot ' + (s.recording ? 'rec' : 'ok');
  $('#r-session').textContent = s.title;
  $('#r-detail').textContent = t('phone.detail', { n: s.count, cams: s.cams, mic: t(s.mic === 'phone' ? 'st.micPhone' : 'st.micPc') });
  $('#r-narrate').classList.toggle('rec', s.narrating);
  $('#r-clip').classList.toggle('rec', s.clipping);
  if (paired()) {
    $('#r-photo').disabled = $('#r-clip').disabled = !s.cams;
    $('#r-screen').disabled = !s.share;
  }
  tick();
}

function tick() {
  if (state) $('#r-timer').textContent = hhmmss(state.work + (state.recording ? Date.now() - stateAt : 0));
}
setInterval(tick, 500);

let msgTimer;
function message(text, err = false) {
  const el = $('#msg');
  el.textContent = text;
  el.classList.toggle('err', err);
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => (el.textContent = ''), 5000);
}

function command(action) {
  const id = crypto.randomUUID().slice(0, 8);
  return new Promise((resolve) => {
    pendingCmds.set(id, resolve);
    conn.send({ kind: 'cmd', id, action });
    setTimeout(() => pendingCmds.has(id) && (pendingCmds.delete(id), resolve({ ok: false, error: t('phone.cmdTimeout') })), 10000);
  });
}

document.querySelectorAll('.pad-btn[data-cmd]').forEach((b) => {
  b.onclick = async () => {
    if (!paired()) return message(t('phone.notConnected'), true);
    navigator.vibrate?.(30);
    // Repère : horodaté par le téléphone (précis même si le réseau traîne).
    if (b.dataset.cmd === 'marker') {
      conn.send({ kind: 'marker', t: Date.now(), text: '' });
      return message('📍 ' + t('phone.marker'));
    }
    b.disabled = true;
    const r = await command(b.dataset.cmd);
    b.disabled = false;
    if (state) renderState(state);
    if (!r.ok) message(r.error, true);
  };
});

// ---------- Ce téléphone comme source : micro sans fil, caméra en direct ----------
function placeCall(kind) {
  src[kind].call?.close();
  const metadata = { kind, token, label: kind === 'cam' ? '📱 ' + t('phone.liveLabel') : '' };
  src[kind].call = peer.call(hostId, src[kind].stream, { metadata });
}

async function startSource(kind) {
  const constraints = kind === 'mic'
    ? { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }
    : { video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false };
  src[kind].stream = await navigator.mediaDevices.getUserMedia(constraints);
  placeCall(kind);
  if (kind === 'cam') {
    $('#live').srcObject = src.cam.stream;
    $('#live').hidden = false;
  } else {
    meter(src.mic.stream);
  }
  keepAwake();
}

function stopSource(kind) {
  if (paired()) conn.send({ kind: 'stop', what: kind });
  src[kind].call?.close();
  src[kind].stream?.getTracks().forEach((tr) => tr.stop());
  src[kind] = { stream: null, call: null };
  if (kind === 'cam') $('#live').hidden = true;
  else meter(null);
  keepAwake();
}

async function toggleSource(kind, btn) {
  try {
    if (src[kind].stream) stopSource(kind);
    else await startSource(kind);
  } catch (e) {
    message(`${t(kind === 'mic' ? 'err.mic' : 'err.camera')} ${e.message}`, true);
  }
  btn.classList.toggle('on', !!src[kind].stream);
  if (src.mic.stream || src.cam.stream) message(t('phone.keepOpen'));
}

$('#p-mic').onclick = () => toggleSource('mic', $('#p-mic'));
$('#p-live').onclick = () => toggleSource('cam', $('#p-live'));

// Jauge du micro (le contexte audio naît d'un appui : il n'est pas bloqué).
let audioCtx, raf;
function meter(stream) {
  cancelAnimationFrame(raf);
  audioCtx?.close();
  audioCtx = null;
  const bar = $('#p-mic .level i');
  bar.style.setProperty('--lvl', 0);
  if (!stream) return;
  audioCtx = new AudioContext();
  audioCtx.resume?.().catch(() => {});
  const an = audioCtx.createAnalyser();
  an.fftSize = 512;
  audioCtx.createMediaStreamSource(stream).connect(an);
  const buf = new Uint8Array(an.fftSize);
  const loop = () => {
    an.getByteTimeDomainData(buf);
    let peak = 0;
    for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
    bar.style.setProperty('--lvl', peak / 128);
    raf = requestAnimationFrame(loop);
  };
  loop();
}

// Écran allumé tant qu'une source est active (sinon le système coupe micro et caméra).
let wakeLock = null;
async function keepAwake() {
  const want = !!(src.mic.stream || src.cam.stream);
  if (want && !wakeLock) wakeLock = await navigator.wakeLock?.request('screen').catch(() => null);
  else if (!want && wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { wakeLock = null; keepAwake(); }
});

// ---------- Envoi de photos, vidéos et notes ----------
function addRow(label) {
  const li = document.createElement('li');
  li.innerHTML = `<span></span><progress max="1" value="0"></progress>`;
  li.querySelector('span').textContent = label;
  $('#sent').prepend(li);
  return li;
}

async function send(file, type) {
  if (!paired()) return message(t('phone.notConnected'), true);
  const id = crypto.randomUUID().slice(0, 8);
  const row = addRow(`${type === 'phone_video' ? '🎬' : '📸'} ${file.name}`);
  const thumb = type === 'phone_video' ? await videoThumb(file) : null;
  const acked = new Promise((r) => pendingAcks.set(id, r));
  // Heure de prise de vue : date du fichier (horloge du téléphone, recalée par le PC).
  await sendFile(conn, { id, type, t: file.lastModified || Date.now(), mime: file.type, name: file.name, blob: file, thumb },
    (p) => (row.querySelector('progress').value = p));
  await acked;
  row.classList.add('done');
}

for (const sel of ['#in-photo', '#in-video', '#in-gallery']) {
  $(sel).addEventListener('change', async (e) => {
    for (const f of e.target.files) await send(f, f.type.startsWith('video') ? 'phone_video' : 'phone_photo');
    e.target.value = '';
  });
}

$('#note-form').onsubmit = (e) => {
  e.preventDefault();
  const text = $('#note').value.trim();
  if (!text) return;
  if (!paired()) return message(t('phone.notConnected'), true);
  conn.send({ kind: 'note', t: Date.now(), text });
  addRow('📝 ' + text).classList.add('done');
  $('#note').value = '';
};

connect();

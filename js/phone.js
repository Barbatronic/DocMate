// Page téléphone : se connecte au PC dont l'identifiant est dans l'URL (#docmate-...).
import { PEERJS, sendFile } from './peer-protocol.js';
import { videoThumb } from './media.js';
import { applyI18n, t } from './i18n.js';

applyI18n();
const $ = (s) => document.querySelector(s);
const hostId = location.hash.slice(1);
const status = (txt, ok) => { $('#status').textContent = txt; $('#status').classList.toggle('ok', !!ok); };

let peer, conn, call;
const pendingAcks = new Map();

async function connect() {
  if (!hostId) return status(t('phone.noHost'));
  const { Peer } = await import(PEERJS);
  peer ??= new Peer();
  peer.on('error', (e) => status(`${t('phone.error')} ${e.type}`));
  const open = () => {
    conn = peer.connect(hostId, { reliable: true });
    conn.on('open', () => {
      conn.send({ kind: 'hello', now: Date.now() });
      status(t('phone.connected'), true);
    });
    conn.on('data', (m) => m.kind === 'ack' && pendingAcks.get(m.id)?.());
    conn.on('close', () => { status(t('phone.reconnecting')); setTimeout(open, 2000); });
  };
  peer.open ? open() : peer.on('open', open);
}
connect();

function addRow(label) {
  const li = document.createElement('li');
  li.innerHTML = `<span></span><progress max="1" value="0"></progress>`;
  li.querySelector('span').textContent = label;
  $('#sent').prepend(li);
  return li;
}

async function send(file, type) {
  if (!conn?.open) return alert(t('phone.notConnected'));
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

$('#btn-marker').onclick = () => {
  if (!conn?.open) return alert(t('phone.notConnected'));
  conn.send({ kind: 'marker', t: Date.now(), text: '' });
  navigator.vibrate?.(60);
  addRow('📍 ' + t('phone.marker')).classList.add('done');
};

$('#note-form').onsubmit = (e) => {
  e.preventDefault();
  const text = $('#note').value.trim();
  if (!text || !conn?.open) return;
  conn.send({ kind: 'note', t: Date.now(), text });
  addRow('📝 ' + text).classList.add('done');
  $('#note').value = '';
};

// Flux caméra en direct : le PC l'affiche comme une webcam (photos et clips depuis le PC).
$('#btn-live').onclick = async () => {
  if (call) {
    call.close();
    call = null;
    $('#live').srcObject?.getTracks().forEach((tr) => tr.stop());
    $('#live').hidden = true;
    $('#btn-live b').textContent = t('phone.live');
    return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: false,
  });
  $('#live').srcObject = stream;
  $('#live').hidden = false;
  call = peer.call(hostId, stream, { metadata: { label: '📱 ' + t('phone.liveLabel') } });
  $('#btn-live b').textContent = t('phone.stopLive');
  // Garder l'écran allumé pendant la diffusion.
  navigator.wakeLock?.request('screen').catch(() => {});
};

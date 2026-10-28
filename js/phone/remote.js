// Côté PC : câblage du téléphone (télécommande, micro sans fil, caméra en direct, envois) et
// dialogue d'appairage (QR code).
import { t } from '../core/i18n.js';
import { on, emit } from '../core/bus.js';
import { $ } from '../core/dom.js';
import { state, addEvent, sessionLabel } from '../session/session.js';
import { tiles, addTile, clipping, photo, clip } from '../capture/cameras.js';
import { narrator, share, recording, narrate, screenshot, addMarker, switchMic, workMs } from '../capture/recorder.js';
import { micSource } from '../capture/mic.js';
import { PhoneLink, hasPairedBefore } from './link.js';

const QRCODE = 'https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/+esm';

let connected = 0;
export const phonesConnected = () => connected;

// Télécommande. Une erreur levée ici est affichée sur le téléphone.
async function command(action) {
  switch (action) {
    case 'narrate':
      return narrate();
    case 'marker':
      return addMarker();
    case 'photo':
      if (!tiles.length) throw new Error(t('err.noCam'));
      return photo();
    case 'clip':
      if (!tiles.length) throw new Error(t('err.noCam'));
      return clip();
    case 'screen':
      // Le partage d'écran ne peut être lancé que par un clic sur le PC.
      if (!share.active) throw new Error(t('err.screenRemote'));
      return screenshot();
    default:
      throw new Error(`commande inconnue : ${action}`);
  }
}

const link = new PhoneLink({
  onEvent: addEvent,
  // Caméra en direct : la tuile se ferme quand le téléphone arrête la diffusion.
  onStream: async (stream, label, call) => {
    const tile = await addTile({ remote: stream, label });
    call.on('close', () => tile.el.isConnected && tile.close());
  },
  onMic: switchMic,
  onCommand: command,
  onStatus: (text, n) => {
    $('#phone-status').textContent = text;
    $('#phone-status').classList.toggle('ok', n > 0);
    connected = n;
    emit('status');
  },
});

// État affiché par la télécommande du téléphone.
function broadcast() {
  link.broadcast({
    title: sessionLabel(state.session),
    work: workMs(),
    recording: recording(),
    narrating: narrator.active,
    clipping: clipping(),
    count: state.events.length,
    cams: tiles.length,
    mic: micSource(),
    share: share.active,
  });
}

async function openDialog() {
  $('#dlg-phone').showModal();
  try {
    await link.start();
    const url = link.phoneUrl;
    $('#phone-url').href = url;
    $('#phone-url').textContent = url;
    const { default: qrcode } = await import(QRCODE);
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    $('#qr').innerHTML = qr.createSvgTag({ cellSize: 5, margin: 3, scalable: true });
  } catch (e) {
    $('#phone-status').textContent = e.message || String(e);
  }
}

export function initPhone() {
  $('#btn-phone').onclick = openDialog;
  $('#btn-phone-2').onclick = openDialog;
  for (const type of ['status', 'session', 'event:added', 'event:removed']) on(type, broadcast);
}

// Téléphone déjà appairé : la liaison s'ouvre tout de suite, il se reconnecte sans rescanner.
export function bootPhone() {
  if (hasPairedBefore()) link.start().catch((e) => console.warn('Liaison téléphone', e));
}

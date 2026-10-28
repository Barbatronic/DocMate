// Tuiles caméra : ajout, restauration au démarrage, disposition, photo et clip sur les caméras visées.
import { F } from '../core/features.js';
import { S, save } from '../core/settings.js';
import { t } from '../core/i18n.js';
import { on, emit } from '../core/bus.js';
import { $, esc, toast } from '../core/dom.js';
import { addEvent } from '../session/session.js';
import { CameraTile } from './camera-tile.js';

export const tiles = [];
let devices = [];

export const clipping = () => tiles.some((tl) => tl.recording);

export async function addTile({ deviceId, remote, label } = {}) {
  const tile = new CameraTile({
    container: $('#cams'),
    sink: addEvent,
    deviceId,
    remote,
    label,
    onClose: (tl) => {
      tiles.splice(tiles.indexOf(tl), 1);
      saveCams();
      changed();
    },
  });
  tiles.push(tile);
  changed();
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

// Caméras visées par les raccourcis : la tuile active, sinon toutes.
const targets = () => {
  const act = tiles.filter((tl) => tl.el.classList.contains('active'));
  return act.length ? act : tiles;
};

export async function photo() {
  if (!tiles.length) return toast(t('err.noCam'));
  await Promise.all(targets().map((tl) => tl.photo()));
}

export async function clip() {
  if (!tiles.length) return toast(t('err.noCam'));
  const tg = targets();
  const anyRec = tg.some((tl) => tl.recording);
  await Promise.all(tg.map((tl) => (anyRec ? tl.stopClip() : tl.toggleClip())));
  emit('status');
}

export const stopClips = () => Promise.all(tiles.map((tl) => tl.stopClip()));

// Caméras ouvertes, retenues par identifiant et par nom : le navigateur peut changer l'identifiant
// d'un chargement à l'autre (données effacées, navigation privée…), le nom reste.
function saveCams() {
  S.capture.cameras = tiles.filter((tl) => !tl.remote && tl.deviceId).map((tl) => ({ id: tl.deviceId, label: tl.label }));
  save();
}

function findDevice(saved, used) {
  const { id, label } = typeof saved === 'string' ? { id: saved } : saved; // ancien format : identifiant seul
  const free = devices.filter((d) => !used.has(d.deviceId));
  return free.find((d) => d.deviceId === id) || (label && free.find((d) => d.label === label));
}

function changed() {
  $('#cams-empty').hidden = tiles.length > 0;
  $('#cams').dataset.n = tiles.length;
  layoutCams();
  emit('status');
}

async function refreshDevices() {
  const all = await navigator.mediaDevices.enumerateDevices();
  devices = all.filter((d) => d.kind === 'videoinput');
  tiles.forEach((tl) => tl.fillDevices(devices));
  const mics = all.filter((d) => d.kind === 'audioinput');
  $('#mic-select').innerHTML = mics.map((m, i) => `<option value="${esc(m.deviceId)}">${esc(m.label || 'Micro ' + (i + 1))}</option>`).join('');
  $('#mic-select').value = S.capture.micId || mics[0]?.deviceId || '';
}

// La plus grande taille 16:9 qui tient dans la zone libre, avec le nombre de colonnes qui la donne
// (1 caméra : plein cadre ; 2 : côte à côte ou l'une sous l'autre ; etc.). Pas de défilement.
const CAM_GAP = 10;
const CAM_RATIO = 16 / 9;
export function layoutCams() {
  const box = $('#cams');
  const n = tiles.length;
  const { width: W, height: H } = box.getBoundingClientRect();
  if (!n || !W || !H) return;
  let best = { w: 0, cols: 1 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const w = Math.min((W - CAM_GAP * (cols - 1)) / cols, ((H - CAM_GAP * (rows - 1)) / rows) * CAM_RATIO);
    if (w > best.w) best = { w, cols };
  }
  box.style.setProperty('--cols', best.cols);
  box.style.setProperty('--tile-w', `${Math.floor(best.w)}px`);
}

export function initCameras() {
  changed();
  new ResizeObserver(layoutCams).observe($('#cams'));
  $('#cams').addEventListener('camchange', saveCams);
  $('#cams').addEventListener('recchange', () => emit('status'));
  on('detail', (ev) => !ev && layoutCams()); // retour de la vue détaillée
}

// Rouvre les caméras de la dernière fois.
export async function restoreCameras() {
  if (!F.camera) return;
  try {
    await refreshDevices();
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
    const used = new Set();
    for (const saved of S.capture.cameras) {
      const d = findDevice(saved, used);
      if (!d) continue;
      used.add(d.deviceId);
      await addTile({ deviceId: d.deviceId });
    }
  } catch (e) {
    console.warn(e);
  }
}

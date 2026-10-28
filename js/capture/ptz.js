// Cadrage PTZ (pan, tilt, zoom) des caméras qui le proposent : Elgato Facecam, Logitech MX Brio,
// Insta360 Link, Obsbot… L'accès est demandé à l'ouverture de la caméra (pan/tilt/zoom: true) ; les
// axes disponibles sont lus dans getCapabilities(). Chromium seulement ; ailleurs rien ne s'affiche.
// La caméra garde elle-même sa dernière position : DocMate ne la modifie pas à l'ouverture. Trois
// positions par caméra peuvent être mémorisées ici (réglages, par identifiant de caméra).
import { S, save } from '../core/settings.js';
import { icon } from '../core/icons.js';
import { t } from '../core/i18n.js';

const AXES = ['pan', 'tilt', 'zoom'];
const SLOTS = 3;

// Contraintes à ajouter à getUserMedia pour obtenir l'accès PTZ (sans effet si la caméra ne le gère pas).
export function ptzRequest() {
  const sup = navigator.mediaDevices.getSupportedConstraints?.() || {};
  return Object.fromEntries(AXES.filter((k) => sup[k]).map((k) => [k, true]));
}

// Axes pilotables de la piste, ou null.
export function ptzCaps(track) {
  const caps = track?.getCapabilities?.() || {};
  const out = {};
  for (const k of AXES) if (caps[k] && caps[k].max > caps[k].min) out[k] = caps[k];
  return Object.keys(out).length ? out : null;
}

export class Ptz {
  constructor(host, track, deviceId, caps) {
    this.track = track;
    this.deviceId = deviceId;
    this.caps = caps;
    this.pos = {};
    this.el = document.createElement('div');
    this.el.className = 'ptz';
    this.el.hidden = true;
    const btn = (attrs, ic, title) => `<button class="icon-btn" ${attrs} title="${title}">${icon(ic)}</button>`;
    this.el.innerHTML = `
      ${caps.pan || caps.tilt ? `<div class="ptz-pad">
        ${caps.tilt ? btn('data-axis="tilt" data-dir="1" style="grid-area:up"', 'chevron-up', '') : ''}
        ${caps.pan ? btn('data-axis="pan" data-dir="-1" style="grid-area:left"', 'chevron-left', '') : ''}
        ${btn('data-reset style="grid-area:mid"', 'target', t('ptz.reset'))}
        ${caps.pan ? btn('data-axis="pan" data-dir="1" style="grid-area:right"', 'chevron-right', '') : ''}
        ${caps.tilt ? btn('data-axis="tilt" data-dir="-1" style="grid-area:down"', 'chevron-down', '') : ''}
      </div>` : ''}
      ${caps.zoom ? `<div class="ptz-zoom">
        ${btn('data-axis="zoom" data-dir="-1"', 'zoom-out', t('ptz.zoomOut'))}
        <input type="range" min="${caps.zoom.min}" max="${caps.zoom.max}" step="${caps.zoom.step || 'any'}" aria-label="Zoom">
        ${btn('data-axis="zoom" data-dir="1"', 'zoom-in', t('ptz.zoomIn'))}
      </div>` : ''}
      <div class="ptz-presets">
        ${Array.from({ length: SLOTS }, (_, i) => `<button class="ptz-slot" data-slot="${i}">${i + 1}</button>`).join('')}
        <button class="ptz-save" title="${t('ptz.saveHint')}">${icon('save')}<span>${t('ptz.save')}</span></button>
      </div>`;
    host.append(this.el);
    this.bind();
    this.read();
  }

  // Position actuelle lue sur la caméra (elle a pu bouger : logiciel du fabricant, autre onglet).
  read() {
    const s = this.track.getSettings();
    for (const k of Object.keys(this.caps)) this.pos[k] = s[k] ?? this.caps[k].min;
    this.render();
  }

  get presets() {
    S.capture.ptzPresets ||= {};
    return (S.capture.ptzPresets[this.deviceId] ||= Array(SLOTS).fill(null));
  }

  toggle() {
    this.el.hidden = !this.el.hidden;
    if (!this.el.hidden) this.read();
    return !this.el.hidden;
  }

  bind() {
    // Flèches et +/− : un appui = un pas ; maintenu = mouvement continu.
    for (const b of this.el.querySelectorAll('[data-axis]')) {
      let timer;
      const stop = () => { clearTimeout(timer); clearInterval(timer); };
      b.onpointerdown = (e) => {
        e.preventDefault();
        b.setPointerCapture?.(e.pointerId);
        const go = () => this.step(b.dataset.axis, Number(b.dataset.dir));
        go();
        timer = setTimeout(() => (timer = setInterval(go, 90)), 350);
      };
      b.onpointerup = b.onpointercancel = b.onlostpointercapture = stop;
    }
    this.el.querySelector('[data-reset]')?.addEventListener('click', () =>
      this.set({ pan: 0, tilt: 0, zoom: this.caps.zoom?.min }));
    const range = this.el.querySelector('input[type=range]');
    if (range) range.oninput = () => this.set({ zoom: Number(range.value) });

    const saveBtn = this.el.querySelector('.ptz-save');
    saveBtn.onclick = () => this.el.classList.toggle('saving');
    for (const b of this.el.querySelectorAll('.ptz-slot')) {
      b.onclick = () => {
        const i = Number(b.dataset.slot);
        if (this.el.classList.contains('saving')) {
          this.presets[i] = { ...this.pos };
          save();
          this.el.classList.remove('saving');
          this.render();
          this.flash(b);
        } else if (this.presets[i]) {
          this.set(this.presets[i]);
        }
      };
    }
    // Les clics dans le panneau ne doivent pas changer la caméra active.
    this.el.addEventListener('click', (e) => e.stopPropagation());
  }

  step(axis, dir) {
    const c = this.caps[axis];
    const inc = Math.max(c.step || 0, (c.max - c.min) * (axis === 'zoom' ? 0.04 : 0.025));
    this.set({ [axis]: this.pos[axis] + dir * inc });
  }

  set(target) {
    for (const [k, v] of Object.entries(target)) {
      const c = this.caps[k];
      if (!c || v == null) continue;
      let x = Math.min(c.max, Math.max(c.min, v));
      if (c.step) x = Math.min(c.max, c.min + Math.round((x - c.min) / c.step) * c.step);
      this.pos[k] = x;
    }
    this.render();
    this.apply();
  }

  // Un seul applyConstraints à la fois ; la dernière position demandée gagne.
  async apply() {
    if (this.busy) { this.dirty = true; return; }
    this.busy = true;
    try {
      do {
        this.dirty = false;
        await this.track.applyConstraints({ advanced: [{ ...this.pos }] });
      } while (this.dirty);
    } catch (e) {
      console.warn('Cadrage PTZ refusé par la caméra', e);
    } finally {
      this.busy = false;
    }
  }

  render() {
    const range = this.el.querySelector('input[type=range]');
    if (range && this.pos.zoom != null) range.value = this.pos.zoom;
    this.el.querySelectorAll('.ptz-slot').forEach((b, i) => {
      b.classList.toggle('set', !!this.presets[i]);
      b.title = this.presets[i] ? t('ptz.recall', { n: i + 1 }) : t('ptz.empty');
    });
  }

  flash(b) {
    b.classList.add('ok');
    setTimeout(() => b.classList.remove('ok'), 700);
  }

  destroy() {
    this.el.remove();
  }
}

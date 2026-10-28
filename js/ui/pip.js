// Barre flottante (Document Picture-in-Picture) au-dessus de la CAO : état de la session, outils de
// capture dans l'ordre de la barre principale, nombre d'éléments.
import { F } from '../core/features.js';
import { t } from '../core/i18n.js';
import { icon } from '../core/icons.js';
import { on } from '../core/bus.js';
import { $$, esc, hhmmss, toast } from '../core/dom.js';
import { state, sessionLabel } from '../session/session.js';
import { tiles, photo, clip, clipping } from '../capture/cameras.js';
import { narrator, narrate, screenshot, addMarker, recording, workMs } from '../capture/recorder.js';

// Même ordre que le secteur Capture de la barre principale.
const TOOLS = [
  ['narrate', 'mic', 'act.narrate'],
  ['photo', 'photo', 'act.photo'],
  ['clip', 'clip', 'act.clip'],
  ['marker', 'marker', 'act.marker'],
  ['screen', 'screen', 'act.screen'],
];
const ACTIONS = { narrate, photo, clip, marker: () => addMarker(), screen: screenshot };
// Photo et clip sans caméra : le message s'afficherait sur la page principale, cachée derrière la
// CAO ; on le signale sur le bouton lui-même.
const NEEDS_CAM = new Set(['photo', 'clip']);

export const pip = {
  win: null,

  async open() {
    if (!F.pip) return toast(t('pip.unavailable'));
    if (this.win) return this.win.focus();
    this.win = await documentPictureInPicture.requestWindow({ width: 470, height: 58 });
    const d = this.win.document;
    $$('link[rel=stylesheet]').forEach((l) => d.head.append(Object.assign(d.createElement('link'), { rel: 'stylesheet', href: l.href })));
    if (document.documentElement.dataset.theme) d.documentElement.dataset.theme = document.documentElement.dataset.theme;
    d.title = 'DocMate';
    d.body.className = 'pip';
    d.body.innerHTML = `
      <div class="pip-state"><span class="dot"></span><span class="timer">00:00:00</span></div>
      <div class="pip-tools">${TOOLS.map(([a, ic, k]) => `<button data-a="${a}" class="tool-btn" title="${esc(t(k))}">${icon(ic)}${a === 'narrate' ? '<span class="level"><i></i></span>' : ''}<span>${esc(t(k))}</span></button>`).join('')}</div>
      <div class="pip-count" title="${esc(t('tl.title'))}">${icon('sessions')}<span></span></div>`;
    d.body.onclick = async (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      const a = b.dataset.a;
      if (NEEDS_CAM.has(a) && !tiles.length) return this.feedback(b, false, t('err.noCam'));
      try {
        await ACTIONS[a]();
        if (a !== 'narrate' && a !== 'clip') this.feedback(b, true);
      } catch (err) {
        this.feedback(b, false, err.message);
      }
    };
    this.win.addEventListener('pagehide', () => {
      clearInterval(this.timer);
      this.win = null;
    });
    this.timer = setInterval(() => (d.querySelector('.pip-state .timer').textContent = hhmmss(workMs())), 500);
    this.update();
  },

  feedback(b, ok, msg = '') {
    b.classList.remove('done', 'fail');
    void b.offsetWidth;
    b.classList.add(ok ? 'done' : 'fail');
    if (msg) b.title = msg;
  },

  update() {
    if (!this.win) return;
    const d = this.win.document;
    d.querySelector('.pip-state .dot').className = 'dot ' + (recording() ? 'rec' : 'ok');
    d.querySelector('.pip-state').title = `${sessionLabel(state.session)} · ${t('st.work')}`;
    d.querySelector('[data-a=clip]').classList.toggle('rec', clipping());
    d.querySelector('[data-a=narrate]').classList.toggle('rec', narrator.active);
    d.querySelector('.pip-count span').textContent = state.events.length;
  },

  level(lvl) {
    this.win?.document.querySelector('[data-a=narrate] .level i')?.style.setProperty('--lvl', lvl);
  },
};

export function initPip() {
  for (const type of ['status', 'session', 'event:added', 'event:removed']) on(type, () => pip.update());
  on('level', (lvl) => pip.level(lvl));
}

// Petits outils d'interface partagés.

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const hhmmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');
};

// Heure d'un élément ; la date aussi s'il ne date pas d'aujourd'hui.
export function clockOf(ms) {
  const d = new Date(ms);
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })} ${time}`;
}

// Un seul message à la fois : le nouveau remplace le précédent.
export function toast(msg, ms = 4000) {
  document.querySelectorAll('.toast').forEach((x) => x.remove());
  const el = Object.assign(document.createElement('div'), { className: 'toast', textContent: msg });
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}

// Icône de chaque type d'élément de la timeline.
export const TYPE_ICON = { photo: 'photo', phone_photo: 'phone', screenshot: 'screen', clip: 'clip', phone_video: 'video', audio: 'mic', marker: 'marker', note: 'note' };

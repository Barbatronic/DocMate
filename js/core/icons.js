// Icônes simples dessinées en SVG (24 × 24, trait), même dessin que VibeCAD et VibeEDA.
// Dans le HTML : <i data-icon="photo"></i>, remplacé par le SVG au chargement (applyIcons).

const P = {
  // Reprises de VibeCAD.
  trash: '<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6.5 7l1 13h9l1-13"/><path d="M10 11v6M14 11v6"/>',
  save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4"/><rect x="8" y="13" width="8" height="5"/>',
  open: '<path d="M3.5 7.5v11h17V9.5h-8l-2-2z"/>',
  new: '<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4"/><path d="M12 11v6M9 14h6"/>',
  import: '<path d="M12 3.5v11"/><path d="M8 10.5l4 4 4-4"/><path d="M4.5 15.5v4h15v-4"/>',
  export: '<path d="M12 14.5v-11"/><path d="M8 7.5l4-4 4 4"/><path d="M4.5 15.5v4h15v-4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/><circle cx="12" cy="12" r="6.5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r="0.9" fill="currentColor"/>',
  warning: '<path d="M12 3.5l9 16H3z"/><path d="M12 10v4.5"/><circle cx="12" cy="17" r="0.9" fill="currentColor"/>',
  ok: '<circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.3l2.6 2.6 5-5.2"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="M3 17l5.5-5 4 3.5 3-2.5L21 17"/>',
  panel: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M9 4.5v15"/>',
  // Propres à DocMate.
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  'chevron-left': '<path d="M14.5 6l-6 6 6 6"/>',
  'chevron-right': '<path d="M9.5 6l6 6-6 6"/>',
  'chevron-up': '<path d="M6 14.5l6-6 6 6"/>',
  'chevron-down': '<path d="M6 9.5l6 6 6-6"/>',
  target: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
  'zoom-in': '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5l5 5M8 10.5h5M10.5 8v5"/>',
  'zoom-out': '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5l5 5M8 10.5h5"/>',
  ptz: '<rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M12 2.5v2.5M10.5 4L12 2.5 13.5 4M12 21.5V19M10.5 20l1.5 1.5 1.5-1.5M2.5 12H5M4 10.5L2.5 12 4 13.5M21.5 12H19M20 10.5l1.5 1.5-1.5 1.5"/>',
  play: '<circle cx="12" cy="12" r="8.5"/><path d="M10 8.5v7l5.5-3.5z" fill="currentColor"/>',
  stop: '<circle cx="12" cy="12" r="8.5"/><rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0013 0"/><path d="M12 17.5V21M9 21h6"/>',
  photo: '<path d="M3.5 8h3.5l1.8-2.5h6.4L17 8h3.5v11h-17z"/><circle cx="12" cy="13" r="3.5"/>',
  clip: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10.5l5-3v9l-5-3"/><circle cx="9.5" cy="12" r="2" fill="currentColor"/>',
  marker: '<path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0113 0C18.5 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.3"/>',
  screen: '<rect x="3" y="4" width="18" height="12.5" rx="1.5"/><path d="M8.5 20h7M12 16.5V20"/><path d="M7 8.5V7h1.5M17 8.5V7h-1.5M7 12v1.5h1.5M17 12v1.5h-1.5" opacity="0.7"/>',
  'cam-add': '<path d="M3 6h12a1.5 1.5 0 011.5 1.5V9l4.5-2.5v11L16.5 15v1.5A1.5 1.5 0 0115 18H3z"/><path d="M9 9v6M6 12h6"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  pip: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><rect x="12" y="11.5" width="7" height="5.5" rx="1" fill="currentColor" opacity="0.35"/>',
  sparkle: '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  sessions: '<rect x="3.5" y="4" width="17" height="5" rx="1.2"/><rect x="3.5" y="11" width="17" height="5" rx="1.2" opacity="0.7"/><path d="M6.5 19.5h11" opacity="0.5"/>',
  note: '<path d="M5 3.5h10l4 4v13H5z"/><path d="M15 3.5v4h4"/><path d="M8.5 12h7M8.5 15.5h5"/>',
  send: '<path d="M3.5 11.5l17-7.5-7.5 17-2-7.5z"/><path d="M11 13.5l9.5-9.5"/>',
  live: '<circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M8 8a5.7 5.7 0 000 8M16 8a5.7 5.7 0 010 8"/><path d="M5 5a10 10 0 000 14M19 5a10 10 0 010 14"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10.5l5-3v9l-5-3"/>',
  remote: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><circle cx="12" cy="9" r="2.5"/><path d="M9.5 14.5h1M13.5 14.5h1M9.5 17.5h1M13.5 17.5h1"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V5.5A1.5 1.5 0 0014.5 4h-9A1.5 1.5 0 004 5.5v9A1.5 1.5 0 005.5 16H8"/>',
  package: '<path d="M3.5 7.5L12 3.5l8.5 4v9L12 20.5l-8.5-4z"/><path d="M3.5 7.5L12 11.5l8.5-4M12 11.5v9"/><path d="M7.8 5.5l8.5 4" opacity="0.6"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 11-2.2-5.3"/><path d="M19.5 4v4.5H15"/>',
};

export function icon(name, cls = '') {
  return `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name] ?? P.info}</svg>`;
}

export function applyIcons(root = document) {
  root.querySelectorAll('i[data-icon]').forEach((el) => {
    el.outerHTML = icon(el.dataset.icon, el.className);
  });
}

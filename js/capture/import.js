// Fichiers ajoutés à la session : glisser-déposer n'importe où dans la page, ou coller (Ctrl+V).
import { $ } from '../core/dom.js';
import { addEvent } from '../session/session.js';

export function importFiles(files, sink = addEvent) {
  return Promise.all([...files].map((f) => {
    const type = f.type.startsWith('video') ? 'clip' : f.type.startsWith('image') ? 'screenshot' : f.type.startsWith('audio') ? 'audio' : null;
    if (!type) return null;
    return sink({ type, t: f.lastModified || Date.now(), source: 'fichier', mime: f.type, name: f.name }, { blob: f });
  }));
}

export function initImport() {
  let depth = 0;
  addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    depth++;
    $('#drop-overlay').hidden = false;
  });
  addEventListener('dragleave', () => {
    if (--depth > 0) return;
    depth = 0;
    $('#drop-overlay').hidden = true;
  });
  addEventListener('dragover', (e) => e.preventDefault());
  addEventListener('drop', async (e) => {
    e.preventDefault();
    depth = 0;
    $('#drop-overlay').hidden = true;
    if (e.dataTransfer?.files.length) await importFiles(e.dataTransfer.files);
  });
  // Coller une image : utile pour les captures copiées dans le presse-papiers.
  addEventListener('paste', async (e) => {
    if (e.target.closest('input, textarea, [contenteditable]')) return;
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image'));
    if (files.length) await importFiles(files.map((f) => new File([f], f.name || 'presse-papiers.png', { type: f.type, lastModified: Date.now() })));
  });
}

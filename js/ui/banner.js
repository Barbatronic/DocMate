// Bandeau des fonctions du navigateur, et boutons masqués quand une fonction manque.
import { F, capabilityReport } from '../core/features.js';
import { t } from '../core/i18n.js';
import { icon } from '../core/icons.js';
import { $, esc } from '../core/dom.js';

export function initBanner() {
  const r = capabilityReport(t);
  const el = $('#banner');
  el.hidden = false;
  if (r.ok) {
    el.className = 'banner ok';
    el.innerHTML = `${icon('ok')}<span>${esc(t('cap.ok'))}</span>`;
    setTimeout(() => (el.hidden = true), 5000);
  } else {
    el.className = 'banner warn';
    el.innerHTML = `${icon('warning')}<span><b>${esc(t('cap.limited'))}</b> ${r.missing.map(esc).join(' · ')}. ${esc(t('cap.advice'))}</span>
      <button class="icon-btn small" title="✕">${icon('close')}</button>`;
    $('button', el).onclick = () => (el.hidden = true);
  }
  if (!F.pip) $('#btn-pip').hidden = true;
  if (!F.dirWrite) {
    $('#btn-write').hidden = true;
    $('#btn-site').hidden = true;
    $('#btn-shots').disabled = true;
  }
}

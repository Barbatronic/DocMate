// Dialogue « Réglages » : IA, transcription, profils de sortie, capture, thème et langue.
// Les champs portent leur chemin dans les réglages (data-k="agent.provider") ou dans le profil (data-p).
import { S, save, profile, resetProfiles } from '../core/settings.js';
import { t } from '../core/i18n.js';
import { $, $$, esc, toast } from '../core/dom.js';
import { exportProfile, importProfile } from '../output/profiles.js';
import { pickShotsFolder, shotsFolder } from '../capture/recorder.js';

const getPath = (path) => path.split('.').reduce((o, k) => o?.[k], S);
const setPath = (path, v) => {
  const ks = path.split('.');
  const last = ks.pop();
  ks.reduce((o, k) => o[k], S)[last] = v;
};

export function fillProfileSelect(sel) {
  sel.innerHTML = S.profiles.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  sel.value = S.profileId;
}

export function applyTheme() {
  if (S.theme) document.documentElement.dataset.theme = S.theme;
  else delete document.documentElement.dataset.theme;
}

function bindSettings() {
  $$('[data-k]', $('#dlg-settings')).forEach((el) => {
    const v = getPath(el.dataset.k);
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v ?? '';
    el.onchange = () => {
      setPath(el.dataset.k, el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value);
      save();
      showHide();
      if (el.dataset.k === 'lang') location.reload();
      if (el.dataset.k === 'theme') applyTheme();
    };
  });
  showHide();
}

// Champs qui dépendent d'un choix (data-show="agent.provider=ollama").
function showHide() {
  $$('[data-show]').forEach((el) => {
    const [k, v] = el.dataset.show.split('=');
    el.hidden = getPath(k) !== v;
  });
}

function bindProfile() {
  const sel = $('#prof-select');
  fillProfileSelect(sel);
  const p = profile();
  $$('[data-p]').forEach((el) => {
    el.value = p[el.dataset.p] ?? '';
    el.onchange = () => {
      p[el.dataset.p] = el.type === 'number' ? Number(el.value) : el.value;
      save();
      if (el.dataset.p === 'name') fillProfileSelect(sel);
    };
  });
  const ul = $('#prof-examples');
  ul.innerHTML = '';
  (p.examples || []).forEach((ex, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${esc(ex.name)}</span><button class="icon-btn small">✕</button>`;
    $('button', li).onclick = () => { p.examples.splice(i, 1); save(); bindProfile(); };
    ul.append(li);
  });
}

const renderShots = () => ($('#shots-label').textContent = shotsFolder() ? t('set.shots', { name: shotsFolder() }) : t('set.noShots'));

export function initSettingsDialog() {
  $('#btn-settings').onclick = () => {
    bindSettings();
    bindProfile();
    renderShots();
    $('#dlg-settings').showModal();
  };

  $$('.tab').forEach((b) => (b.onclick = () => {
    $$('.tab').forEach((x) => x.classList.toggle('active', x === b));
    $$('.tab-pane').forEach((p) => (p.hidden = p.dataset.pane !== b.dataset.tab));
  }));

  $('#btn-shots').onclick = async () => { await pickShotsFolder(); renderShots(); };

  // Profils de sortie.
  $('#prof-select').onchange = (e) => { S.profileId = e.target.value; save(); bindProfile(); };
  $('#prof-dup').onclick = () => {
    const p = { ...structuredClone(profile()), id: 'custom-' + Date.now().toString(36) };
    p.name += ` (${t('set.copy')})`;
    S.profiles.push(p);
    S.profileId = p.id;
    save();
    bindProfile();
  };
  $('#prof-export').onclick = () => exportProfile(profile());
  $('#prof-import').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const p = importProfile(await f.text());
      S.profiles.push(p);
      S.profileId = p.id;
      save();
      bindProfile();
    } catch (err) {
      toast(err.message);
    }
    e.target.value = '';
  };
  $('#prof-reset').onclick = () => { if (confirm(t('set.confirmReset'))) { resetProfiles(); bindProfile(); } };
  $('#prof-ex-add').onchange = async (e) => {
    const p = profile();
    p.examples ||= [];
    for (const f of e.target.files) p.examples.push({ name: f.name, text: await f.text() });
    save();
    bindProfile();
    e.target.value = '';
  };
}

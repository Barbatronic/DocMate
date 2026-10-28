// Vue détaillée d'un élément de la timeline, à la place des caméras : grand aperçu et de la place pour
// le modifier (légende, texte d'une note, transcription d'une narration phrase par phrase).
// Les caméras continuent de tourner derrière ; « Caméras » ou Échap les ramène.
import { t } from '../core/i18n.js';
import { icon } from '../core/icons.js';
import { on, emit } from '../core/bus.js';
import { $, esc, clockOf, TYPE_ICON } from '../core/dom.js';
import { state, saveEvent, removeEvent, blobUrl } from '../session/session.js';
import { transcribeEvent, isTranscribing } from '../session/transcription.js';

// Type d'élément -> façon de l'afficher.
const VIEW = { photo: 'image', phone_photo: 'image', screenshot: 'image', clip: 'video', phone_video: 'video', audio: 'audio', marker: 'text', note: 'text' };

const transcribe = (ev) => transcribeEvent(ev).catch(() => { /* affiché sur l'élément */ });

class Detail {
  constructor(root) {
    this.root = root;
    this.ev = null;
    this.root.innerHTML = `
      <header class="detail-head">
        <button class="btn small ghost" data-act="back" title="Échap">${icon('chevron-left')}<span>${esc(t('detail.back'))}</span></button>
        <span class="detail-title"></span>
        <span class="spacer"></span>
        <button class="icon-btn" data-act="prev" title="${esc(t('detail.prev'))} (←)">${icon('chevron-left')}</button>
        <span class="detail-pos"></span>
        <button class="icon-btn" data-act="next" title="${esc(t('detail.next'))} (→)">${icon('chevron-right')}</button>
        <a class="icon-btn" data-act="download" title="${esc(t('detail.download'))}">${icon('import')}</a>
        <button class="icon-btn" data-act="delete" title="${esc(t('tl.delete'))}">${icon('trash')}</button>
      </header>
      <div class="detail-body"></div>`;
    this.root.querySelector('[data-act=back]').onclick = () => this.close();
    this.root.querySelector('[data-act=prev]').onclick = () => this.step(-1);
    this.root.querySelector('[data-act=next]').onclick = () => this.step(1);
    this.root.querySelector('[data-act=delete]').onclick = () => removeEvent(this.ev);
  }

  get isOpen() {
    return !!this.ev;
  }

  show(ev) {
    this.flush();
    this.ev = ev;
    this.index = state.events.indexOf(ev);
    this.root.hidden = false;
    this.root.parentElement.classList.add('showing-detail');
    this.render();
    emit('detail', ev);
  }

  close() {
    if (!this.ev) return;
    this.flush();
    this.stopAudio();
    this.ev = null;
    this.root.hidden = true;
    this.root.parentElement.classList.remove('showing-detail');
    this.root.querySelector('.detail-body').innerHTML = '';
    emit('detail', null);
  }

  step(dir) {
    const next = state.events[state.events.indexOf(this.ev) + dir];
    if (next) this.show(next);
  }

  // Élément affiché supprimé (ici ou dans la timeline) : on passe au suivant, sinon aux caméras.
  removed(ev) {
    if (this.ev !== ev) return;
    this.pending = null;
    const next = state.events[this.index] || state.events[this.index - 1];
    next ? this.show(next) : this.close();
  }

  // Après un changement venu d'ailleurs (transcription terminée, légende modifiée dans la timeline).
  refresh(ev) {
    if (this.ev?.id !== ev.id) return;
    if (this.root.contains(document.activeElement) && document.activeElement.matches('textarea, [contenteditable]')) return;
    this.render();
  }

  status(ev, text, err = false) {
    if (this.ev?.id !== ev.id) return;
    const el = this.root.querySelector('.detail-status');
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
    el.classList.toggle('err', err);
  }

  // ---------- Rendu ----------
  render() {
    const ev = this.ev;
    const list = state.events;
    const view = VIEW[ev.type] || 'text';
    const dur = ev.tEnd ? ` · ${Math.round((ev.tEnd - ev.t) / 1000)} s` : '';
    this.root.querySelector('.detail-title').innerHTML =
      `${icon(TYPE_ICON[ev.type])}<b>${esc(t('type.' + ev.type))}</b><time>${esc(clockOf(ev.t))}${dur}</time><span class="src">${esc(ev.source || '')}</span>`;
    this.root.querySelector('.detail-pos').textContent = `${list.indexOf(ev) + 1} / ${list.length}`;
    this.root.querySelector('[data-act=prev]').disabled = list.indexOf(ev) <= 0;
    this.root.querySelector('[data-act=next]').disabled = list.indexOf(ev) >= list.length - 1;
    const dl = this.root.querySelector('[data-act=download]');
    dl.hidden = !ev.blobId;
    if (ev.blobId) blobUrl(ev.blobId).then((u) => { dl.href = u; dl.download = ev.name || `${ev.id}.${(ev.mime || '').split('/')[1]?.split(';')[0] || 'bin'}`; });

    this.stopAudio();
    const body = this.root.querySelector('.detail-body');
    body.className = `detail-body view-${view}`;
    if (view === 'image' || view === 'video') {
      body.innerHTML = `
        <div class="detail-media">${view === 'image' ? '<img alt="">' : '<video controls playsinline preload="metadata"></video>'}</div>
        <aside class="detail-side">${this.captionField(ev)}</aside>`;
      blobUrl(ev.blobId).then((u) => (body.querySelector('img, video').src = u));
    } else if (view === 'audio') {
      body.innerHTML = `
        <div class="detail-text">
          <audio controls preload="metadata"></audio>
          ${this.transcriptHtml(ev)}
          ${this.captionField(ev)}
        </div>`;
      this.bindAudio(ev, body);
    } else {
      body.innerHTML = `<div class="detail-text">${this.captionField(ev, true)}</div>`;
    }
    this.bindCaption(ev, body);
  }

  captionField(ev, main = false) {
    const label = ev.type === 'note' ? t('detail.note') : ev.type === 'marker' ? t('detail.marker') : t('detail.caption');
    return `<label class="detail-caption"><span>${esc(label)}</span>
      <textarea rows="${main ? 10 : 5}" placeholder="${esc(t('detail.captionPh'))}">${esc(ev.text)}</textarea></label>`;
  }

  // Légende / texte : enregistré en tapant (pas de bouton à penser).
  bindCaption(ev, body) {
    const ta = body.querySelector('.detail-caption textarea');
    ta.oninput = () => {
      clearTimeout(this.saveTimer);
      this.pending = () => { ev.text = ta.value; return saveEvent(ev); };
      this.saveTimer = setTimeout(() => this.flush(), 400);
    };
    ta.onblur = () => this.flush();
  }

  flush() {
    clearTimeout(this.saveTimer);
    const p = this.pending;
    this.pending = null;
    return p?.();
  }

  // ---------- Narration : lecteur + transcription corrigeable ----------
  transcriptHtml(ev) {
    const busy = isTranscribing(ev);
    const status = `<p class="detail-status tl-status" ${busy ? '' : 'hidden'}>${esc(t('tl.transcribing'))}</p>`;
    if (!ev.transcript) {
      return `<div class="tl-tr-row"><button class="btn primary detail-transcribe" ${busy ? 'disabled' : ''}>${icon('note')}<span>${esc(t('tl.transcribe'))}</span></button></div>${status}`;
    }
    return `<div class="tl-tr-row">
        <b>${esc(t('tl.transcript'))}</b>
        <span class="hint">${esc(t('tl.editHint'))}</span>
        <span class="spacer"></span>
        <button class="btn small ghost detail-retranscribe" ${busy ? 'disabled' : ''}>${icon('refresh')}<span>${esc(t('tl.retranscribe'))}</span></button>
      </div>${status}
      <div class="segs detail-segs"></div>`;
  }

  bindAudio(ev, body) {
    const audio = body.querySelector('audio');
    this.audio = audio;
    blobUrl(ev.blobId).then((u) => (audio.src = u));
    body.querySelector('.detail-transcribe')?.addEventListener('click', () => transcribe(ev));
    body.querySelector('.detail-retranscribe')?.addEventListener('click', () => {
      if (ev.transcriptEdited && !confirm(t('tl.confirmRetranscribe'))) return;
      transcribe(ev);
    });
    const segs = body.querySelector('.detail-segs');
    if (!segs) return;
    const rows = ev.transcript.map((seg) => {
      const p = document.createElement('p');
      p.className = 'seg';
      p.innerHTML = `<time title="${esc(t('tl.listen'))}">${esc(clockOf(ev.t + seg.start * 1000))}</time><span class="seg-text" contenteditable="true" spellcheck="true"></span>`;
      const span = p.querySelector('.seg-text');
      span.textContent = seg.text;
      p.querySelector('time').onclick = () => this.playSegment(seg);
      span.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); span.blur(); } };
      span.onblur = () => {
        const text = span.textContent.replace(/\s+/g, ' ').trim();
        if (text === seg.text) return;
        seg.text = text;
        ev.transcriptEdited = true;
        saveEvent(ev);
      };
      segs.append(p);
      return [p, seg];
    });
    // Phrase en cours de lecture surlignée.
    audio.ontimeupdate = () => {
      const now = audio.currentTime;
      for (const [p, seg] of rows) p.classList.toggle('playing', !audio.paused && now >= seg.start && now < (seg.end || seg.start + 10));
    };
    audio.onpause = audio.ontimeupdate;
  }

  // Réécouter une phrase : lecture de son passage, arrêt à la fin de la phrase.
  playSegment(seg) {
    const audio = this.audio;
    if (!audio) return;
    const go = () => {
      audio.currentTime = seg.start;
      audio.play().catch(() => {});
      clearInterval(this.stopTimer);
      this.stopTimer = setInterval(() => {
        if (audio.paused || audio.currentTime >= (seg.end || seg.start + 10) + 0.15) {
          audio.pause();
          clearInterval(this.stopTimer);
        }
      }, 100);
    };
    audio.readyState >= 1 ? go() : audio.addEventListener('loadedmetadata', go, { once: true });
  }

  stopAudio() {
    clearInterval(this.stopTimer);
    this.audio?.pause();
    this.audio = null;
  }
}

let detail;

export function initDetail() {
  detail = new Detail($('#detail'));
  on('open', (ev) => detail.show(ev));
  on('session', () => detail.close());
  on('event:changed', (ev) => detail.refresh(ev));
  on('event:removed', (ev) => detail.removed(ev));
  on('transcribe:status', ({ ev, text, err }) => detail.status(ev, text, err));
  // Échap revient aux caméras, ← → passent d'un élément à l'autre.
  addEventListener('keydown', (e) => {
    if (!detail.isOpen || e.target.closest('dialog[open]')) return;
    if (e.key === 'Escape') {
      e.target.blur?.();
      detail.close();
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.target.closest('input, textarea, select, [contenteditable]')) {
      e.preventDefault();
      detail.step(e.key === 'ArrowLeft' ? -1 : 1);
    }
  });
}

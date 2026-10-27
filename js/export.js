// Export du brouillon : assemble le .md et les médias selon le profil, puis
// écrit dans le dossier du site (Chromium) ou produit un ZIP (tous navigateurs).
import { fill, frontMatter, slugify } from './profiles.js';
import { getBlob } from './store.js';
import { shrink, extOf } from './media.js';

const FFLATE = 'https://cdn.jsdelivr.net/npm/fflate@0.8.3/+esm';

const fmtDate = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmtDuration = (ms) => {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''}`;
};

const joinPath = (...p) => p.filter(Boolean).join('/').replace(/\/+/g, '/');

// Retourne { docPath, files: [{path, data: Blob|string}], vars }.
export async function assemble(profile, session, events, d) {
  const last = events.at(-1);
  const vars = {
    project: slugify(session.project || '') || 'divers',
    date: fmtDate(session.started),
    slug: slugify(d.slug || d.title),
    title: d.title,
    description: d.description,
    state: d.state,
    next_step: d.next_step,
    session: fmtDuration((session.ended || last?.tEnd || last?.t || session.started) - session.started),
  };
  const assetsDir = fill(profile.assetsDir, vars);
  const assetsUrl = fill(profile.assetsUrl, vars);
  const byId = Object.fromEntries(events.map((e) => [e.id, e]));
  const meta = Object.fromEntries((d.media || []).map((m) => [m.id, m]));
  const used = new Set();
  const files = [];

  const body = await replaceAsync(d.body, /^[ \t]*\[\[media:([\w-]+)\]\][ \t]*$/gm, async (_, id) => {
    const ev = byId[id];
    if (!ev?.blobId) return '';
    const m = meta[id] || { filename: id, alt: '', caption: '' };
    const video = ev.type === 'clip' || ev.type === 'phone_video';
    let blob = await getBlob(ev.blobId);
    if (!blob) return '';
    if (!video && profile.webMaxPx && !/png/.test(blob.type)) blob = await shrink(blob, profile.webMaxPx, 'image/jpeg', 0.88);
    let base = slugify(m.filename || id);
    const ext = extOf(blob.type || ev.mime || '');
    let name = `${base}.${ext}`;
    for (let n = 2; used.has(name); n++) name = `${base}-${n}.${ext}`;
    used.add(name);
    files.push({ path: joinPath(assetsDir, name), data: blob });
    const tpl = video ? profile.videoTemplate : profile.imageTemplate;
    return fill(tpl, { url: joinPath(assetsUrl, name), alt: m.alt || '', caption: m.caption || '', mime: (blob.type || 'video/mp4').split(';')[0] });
  });

  const docPath = fill(profile.docPath, vars);
  const text = frontMatter(profile, vars) + '\n' + body.trim() + '\n';
  files.unshift({ path: docPath, data: text });
  return { docPath, files, vars, text };
}

async function replaceAsync(str, re, fn) {
  const jobs = [];
  str.replace(re, (...a) => { jobs.push(fn(...a)); return ''; });
  const out = await Promise.all(jobs);
  let i = 0;
  return str.replace(re, () => out[i++]);
}

// ---------- Écriture dans un dossier (File System Access API) ----------
export async function ensurePermission(handle) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return (await handle.requestPermission(opts)) === 'granted';
}

async function dirFor(root, path, create = true) {
  let dir = root;
  for (const part of path.split('/').filter(Boolean)) dir = await dir.getDirectoryHandle(part, { create });
  return dir;
}

async function exists(root, path) {
  try {
    const parts = path.split('/');
    const dir = await dirFor(root, parts.slice(0, -1).join('/'), false);
    await dir.getFileHandle(parts.at(-1));
    return true;
  } catch {
    return false;
  }
}

export async function writeToDir(root, assembled, profile) {
  // Ne jamais écraser un document existant : suffixe -2, -3...
  let { docPath } = assembled;
  for (let n = 2; await exists(root, docPath); n++) docPath = assembled.docPath.replace(/(\.\w+)$/, `-${n}$1`);
  assembled.files[0].path = docPath;
  const written = [];
  for (const f of assembled.files) {
    const parts = f.path.split('/');
    const dir = await dirFor(root, parts.slice(0, -1).join('/'));
    const fh = await dir.getFileHandle(parts.at(-1), { create: true });
    const w = await fh.createWritable();
    await w.write(f.data);
    await w.close();
    written.push(f.path);
  }
  if (profile.projectFile) {
    const p = fill(profile.projectFile, assembled.vars);
    if (await touchProjectDate(root, p, assembled.vars.date)) written.push(p + ' (date mise à jour)');
  }
  return written;
}

// Met à jour le champ `updated:` d'une fiche projet existante (s'il existe).
async function touchProjectDate(root, path, date) {
  try {
    const parts = path.split('/');
    const dir = await dirFor(root, parts.slice(0, -1).join('/'), false);
    const fh = await dir.getFileHandle(parts.at(-1));
    const text = await (await fh.getFile()).text();
    if (!/^updated:.*$/m.test(text)) return false;
    const next = text.replace(/^updated:.*$/m, `updated: ${date}`);
    if (next === text) return false;
    const w = await fh.createWritable();
    await w.write(next);
    await w.close();
    return true;
  } catch {
    return false;
  }
}

// Liste les projets du site (fichiers .md du dossier projets), avec leur titre.
export async function listProjects(root, projectsDir) {
  if (!root || !projectsDir) return [];
  try {
    const dir = await dirFor(root, projectsDir, false);
    const out = [];
    for await (const [name, h] of dir.entries()) {
      if (h.kind !== 'file' || !name.endsWith('.md')) continue;
      const head = (await (await h.getFile()).text()).slice(0, 600);
      out.push({ slug: name.replace(/\.md$/, ''), title: head.match(/^title:\s*"?(.+?)"?\s*$/m)?.[1] || name });
    }
    return out.sort((a, b) => a.slug.localeCompare(b.slug));
  } catch {
    return [];
  }
}

// Les N docs les plus récents d'un dossier, comme exemples de style.
export async function recentDocs(root, folderPath, n = 3) {
  try {
    const dir = await dirFor(root, folderPath, false);
    const files = [];
    for await (const [name, h] of dir.entries()) if (h.kind === 'file' && /\.md$/.test(name)) files.push({ name, h });
    files.sort((a, b) => b.name.localeCompare(a.name));
    return Promise.all(files.slice(0, n).map(async (f) => ({ name: f.name, text: await (await f.h.getFile()).text() })));
  } catch {
    return [];
  }
}

// ---------- ZIP ----------
export async function downloadZip(assembled) {
  const { zipSync } = await import(FFLATE);
  const entries = {};
  for (const f of assembled.files) {
    const data = typeof f.data === 'string' ? new TextEncoder().encode(f.data) : new Uint8Array(await f.data.arrayBuffer());
    // Pas de recompression des médias (déjà compressés).
    entries[f.path] = [data, { level: typeof f.data === 'string' ? 6 : 0 }];
  }
  const zip = zipSync(entries);
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([zip], { type: 'application/zip' })),
    download: `docmate-${assembled.vars.date}-${assembled.vars.slug}.zip`,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return assembled.files.map((f) => f.path);
}

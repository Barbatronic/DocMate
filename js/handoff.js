// Export « pour un agent » : un dossier de session autonome (consignes, timeline, médias) qu'un agent
// de code (Claude Code, Codex CLI, Gemini CLI...) lit pour rédiger la doc directement dans le dépôt du site.
// Utile pour rédiger avec son abonnement Claude ou ChatGPT plutôt qu'avec une clé API.
import { buildTimeline, systemPrompt } from './agent.js';
import { getBlob } from './store.js';
import { extOf } from './media.js';
import { fill, slugify } from './profiles.js';

const FFLATE = 'https://cdn.jsdelivr.net/npm/fflate@0.8.3/+esm';

const stamp = (ms) => {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const clock = (ms) => new Date(ms).toTimeString().slice(0, 5).replace(':', '');

function missionText(profile, session, events, transcribed) {
  const vars = { project: slugify(session.project || '') || 'divers', date: stamp(session.started) };
  const keep = (tpl) => fill(tpl, vars); // {slug}, {title}... restent à remplir par l'agent
  const hasAudio = events.some((e) => e.type === 'audio');
  return `# Mission

Tu es lancé dans le dépôt du site de l'auteur (dossier courant). Ce dossier de session a été produit par DocMate.

1. Lis \`timeline.md\` (dans ce dossier de session) en entier et **regarde chaque image** référencée : les images sont aussi importantes que la parole pour comprendre ce qui a été fait.
2. Rédige le document en suivant les règles et le style ci-dessous${profile.projectsDir ? `. Pour imiter le style, lis aussi 2 ou 3 documents récents du même projet dans le dépôt (même dossier que le document à créer)` : ''}.
3. Écris le document dans : \`${keep(profile.docPath)}\`
   - \`{slug}\` : kebab-case ASCII, 3 à 6 mots, tiré du titre que tu choisis.
   - Ne remplace jamais un fichier existant : ajoute \`-2\`, \`-3\`... si besoin.
4. En-tête du document (remplace les variables entre accolades, valeurs YAML entre guillemets échappées) :

\`\`\`
${keep(profile.frontMatter).trim()}
\`\`\`

   \`{session}\` = durée de la session (${durationText(session, events)}). \`{state}\` et \`{next_step}\` : vides si la narration n'en parle pas.
5. Médias : copie uniquement ceux que tu utilises, depuis le dossier \`media/\` de la session vers \`${keep(profile.assetsDir)}\`, avec un nom court et parlant (kebab-case ASCII, extension d'origine).${profile.webMaxPx ? ` Si un outil est disponible (ImageMagick, Pillow...), réduis les photos JPEG à ${profile.webMaxPx} px de côté max ; sinon copie-les telles quelles.` : ''} Les fichiers « aperçu » servent à comprendre les vidéos : ne les publie pas, publie la vidéo d'origine.
   URL d'un média dans le Markdown : \`${keep(profile.assetsUrl)}/<nom-du-fichier>\`
   Gabarit image :
\`\`\`
${profile.imageTemplate}
\`\`\`
   Gabarit vidéo :
\`\`\`
${profile.videoTemplate}
\`\`\`
   (\`{url}\` = URL du média, \`{alt}\` = description de l'image, \`{caption}\` = légende courte, \`{mime}\` = type, ex. video/mp4.)
${profile.projectFile ? `6. Si \`${keep(profile.projectFile)}\` existe et contient un champ \`updated:\`, mets-le à \`${vars.date}\`.\n` : ''}
Ne fais ni commit ni push : l'auteur relit d'abord. Si \`.docmate/\` n'est pas dans le \`.gitignore\` du dépôt, propose de l'y ajouter (ce dossier de session ne doit pas être publié). À la fin, donne le chemin du document et la liste des médias copiés.
${hasAudio && !transcribed ? '\n**Attention** : la narration n\'a pas été transcrite. Les fichiers audio sont dans `media/`. Si tu as un outil de transcription (ex. whisper), utilise-le ; sinon, rédige à partir des images et des notes, et signale-le.\n' : ''}`;
}

function durationText(session, events) {
  const last = events.at(-1);
  const m = Math.round(((session.ended || last?.tEnd || last?.t || session.started) - session.started) / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''}`;
}

// Retourne { folder, files: [{path, data}], prompt }.
export async function buildHandoff(profile, session, events, onProgress) {
  // Dans le dépôt, sous .docmate/ : Jekyll (et la plupart des générateurs) ignorent les dossiers en point.
  const name = `session-${stamp(session.started)}-${clock(session.started)}`;
  const folder = `.docmate/${name}`;
  const parts = await buildTimeline(session, events, onProgress, { embed: false });
  const files = [];
  const lines = [];
  for (const p of parts) {
    if (p.text) { lines.push(p.text); continue; }
    const { blobId, ev, role } = p.ref;
    const blob = blobId && (await getBlob(blobId));
    if (!blob) continue;
    const name = role === 'original' ? `${ev.id}.${extOf(blob.type || ev.mime || '')}` : `${ev.id}-${role.replace(/\W+/g, '')}.jpg`;
    files.push({ path: `${folder}/media/${name}`, data: blob });
    lines.push(role === 'original' ? `  fichier : media/${name}` : `  ${role} : media/${name}`);
  }
  // Audio brut, utile si la transcription n'a pas été faite.
  const transcribed = events.filter((e) => e.type === 'audio').every((e) => e.transcript);
  if (!transcribed) {
    for (const ev of events.filter((e) => e.type === 'audio' && !e.transcript)) {
      const blob = await getBlob(ev.blobId);
      if (blob) files.push({ path: `${folder}/media/${ev.id}.${extOf(blob.type)}`, data: blob });
    }
  }
  const consignes =
    missionText(profile, session, events, transcribed) +
    '\n---\n\n# Règles de rédaction\n\n' +
    systemPrompt(profile, { handoff: true }) + '\n';
  files.unshift(
    { path: `${folder}/CONSIGNES.md`, data: consignes },
    { path: `${folder}/timeline.md`, data: `# Timeline de la session\n\n${lines.join('\n')}\n` },
  );
  const prompt = `Lis le fichier ${folder}/CONSIGNES.md et suis ses instructions pour rédiger la documentation de cette session dans ce dépôt.`;
  return { folder, name, files, prompt };
}

export async function writeHandoffToDir(root, h) {
  for (const f of h.files) {
    const parts = f.path.split('/');
    let dir = root;
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true });
    const w = await (await dir.getFileHandle(parts.at(-1), { create: true })).createWritable();
    await w.write(f.data);
    await w.close();
  }
}

export async function downloadHandoffZip(h) {
  const { zipSync } = await import(FFLATE);
  const entries = {};
  for (const f of h.files) {
    const data = typeof f.data === 'string' ? new TextEncoder().encode(f.data) : new Uint8Array(await f.data.arrayBuffer());
    entries[f.path] = [data, { level: typeof f.data === 'string' ? 6 : 0 }];
  }
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([zipSync(entries)], { type: 'application/zip' })),
    download: `docmate-${h.name}.zip`,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// Export « pour un agent » : un dossier de session autonome (consignes, timeline, médias) qu'un agent
// de code (Claude Code, Codex CLI, Gemini CLI...) lit pour rédiger la doc directement dans le dépôt du site.
// Utile pour rédiger avec son abonnement Claude ou ChatGPT plutôt qu'avec une clé API.
import { buildTimeline, systemPrompt } from '../ai/agent.js';
import { getBlob } from '../core/store.js';
import { extOf } from '../capture/media.js';
import { fill, slugify } from './profiles.js';
import { fmtDate as stamp, docDate, sessionDuration, writeFiles, zipFiles } from './export.js';

const clock = (ms) => new Date(ms).toTimeString().slice(0, 5).replace(':', '');

function missionText(profile, session, events, transcribed) {
  const vars = { project: slugify(session.project || '') || 'divers', date: docDate(session, events) };
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

   \`{session}\` = durée de la session (${sessionDuration(session, events)}). \`{state}\` et \`{next_step}\` : vides si la narration n'en parle pas.
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

// Retourne { folder, files: [{path, data}], prompt }.
export async function buildHandoff(profile, session, events, onProgress) {
  // Dans le dépôt, sous .docmate/ : Jekyll (et la plupart des générateurs) ignorent les dossiers en point.
  // Nom du dossier : date et heure de l'export (une session peut être exportée plusieurs fois).
  const now = Date.now();
  const name = `session-${stamp(now)}-${clock(now)}`;
  const folder = `.docmate/${name}`;
  const parts = await buildTimeline(session, events, onProgress, { embed: false });
  const files = [];
  const lines = [];
  for (const p of parts) {
    if (p.text) { lines.push(p.text); continue; }
    const { blobId, ev, role } = p.ref;
    const blob = blobId && (await getBlob(blobId));
    if (!blob) continue;
    const name = role === 'original' ? `${ev.id}.${extOf(blob.type || ev.mime || '')}` : `${ev.id}-${role.normalize('NFD').replace(/\W+/g, '')}.jpg`;
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

export const writeHandoffToDir = (root, h) => writeFiles(root, h.files);

export const downloadHandoffZip = (h) => zipFiles(h.files, `docmate-${h.name}.zip`);

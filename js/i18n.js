// Libellés FR / EN. Le HTML contient le français par défaut (attributs data-i18n, data-i18n-ph, data-i18n-title).
// Ajouter une langue : copier le bloc `en`, traduire, et l'ajouter au sélecteur de langue.

const fr = {
  'cap.ok': '✓ Toutes les fonctions sont disponibles dans ce navigateur.',
  'cap.limited': 'Fonctions limitées dans ce navigateur :',
  'cap.insecure': 'page non sécurisée (ouvrez-la en https ou sur localhost) : caméras et micro bloqués',
  'cap.noMedia': 'pas de capture caméra/micro',
  'cap.noDir': "pas d'écriture directe dans un dossier : export en ZIP, captures d'écran par glisser-déposer ou bouton Capture",
  'cap.noPip': 'pas de barre flottante au-dessus des autres fenêtres',
  'cap.advice': "Pour tout avoir : Chrome, Edge, Opera ou un autre navigateur basé sur Chromium.",
  'session.none': 'Aucune session',
  'session.start': 'Démarrer une session',
  'session.stop': 'Terminer la session',
  'session.resume': 'Reprendre',
  'session.ended': 'terminée',
  'session.confirmDelete': 'Supprimer définitivement cette session et tous ses médias ?',
  'session.open': 'Ouvrir',
  'session.delete': 'Supprimer',
  'session.items': 'éléments',
  'session.empty': 'Aucune session enregistrée.',
  'tl.empty': 'Rien pour le moment. Prenez une photo, lancez la narration, posez un repère…',
  'tl.captionPh': 'légende / note…',
  'tl.delete': 'Retirer de la session',
  'tl.transcript': 'transcription',
  'type.photo': 'Photo', 'type.clip': 'Clip', 'type.screenshot': 'Capture', 'type.audio': 'Narration',
  'type.marker': 'Repère', 'type.note': 'Note', 'type.phone_photo': 'Photo téléphone', 'type.phone_video': 'Vidéo téléphone',
  'act.narrateOn': 'Narration en cours',
  'err.camera': "Impossible d'ouvrir la caméra :",
  'err.mic': "Impossible d'ouvrir le micro :",
  'err.noCam': "Aucune caméra ouverte. Ajoutez-en une, ou connectez le téléphone.",
  'gen.empty': 'La session est vide.',
  'gen.summary': '{n} éléments · {a} segment(s) de narration',
  'gen.transcribing': 'Transcription du segment {i}/{n}…',
  'gen.done': 'Brouillon prêt. Relisez, corrigez, puis écrivez ou téléchargez.',
  'gen.written': 'Fichiers écrits :',
  'gen.zipped': 'ZIP téléchargé. Décompressez-le à la racine du site :',
  'gen.noSite': 'Aucun dossier de site choisi.',
  'gen.site': 'Dossier du site : {name}',
  'gen.siteHintZip': "Ce navigateur ne peut pas écrire dans un dossier : utilisez le ZIP.",
  'gen.examplesAuto': '{n} doc(s) récente(s) du projet utilisées comme modèle de style.',
  'set.noShots': 'Aucun dossier surveillé.',
  'set.shots': 'Dossier surveillé : {name}',
  'set.copy': 'copie',
  'set.confirmReset': 'Remettre les profils par défaut ? Vos profils modifiés seront perdus.',
  'pip.unavailable': "La barre flottante n'est pas disponible dans ce navigateur.",
  'phone.noHost': "Lien incomplet : scannez le QR code affiché sur le PC.",
  'phone.error': 'Erreur :',
  'phone.connected': 'Connecté au PC',
  'phone.reconnecting': 'Reconnexion…',
  'phone.notConnected': "Pas encore connecté au PC.",
  'phone.marker': 'Repère',
  'phone.live': 'Diffuser la caméra en direct',
  'phone.stopLive': 'Arrêter la diffusion',
  'phone.liveLabel': 'Téléphone (direct)',
};

const en = {
  'cap.ok': '✓ All features are available in this browser.',
  'cap.limited': 'Limited features in this browser:',
  'cap.insecure': 'insecure page (open it over https or on localhost): cameras and microphone blocked',
  'cap.noMedia': 'no camera/microphone capture',
  'cap.noDir': 'no direct writing to a folder: ZIP export, screenshots by drag and drop or the Capture button',
  'cap.noPip': 'no floating toolbar above other windows',
  'cap.advice': 'For everything: Chrome, Edge, Opera or another Chromium-based browser.',
  'session.none': 'No session',
  'session.start': 'Start a session',
  'session.stop': 'End session',
  'session.resume': 'Resume',
  'session.ended': 'ended',
  'session.confirmDelete': 'Permanently delete this session and all its media?',
  'session.open': 'Open',
  'session.delete': 'Delete',
  'session.items': 'items',
  'session.empty': 'No saved session.',
  'tl.title': 'Timeline',
  'tl.empty': 'Nothing yet. Take a photo, start narrating, drop a marker…',
  'tl.captionPh': 'caption / note…',
  'tl.delete': 'Remove from session',
  'tl.transcript': 'transcript',
  'tl.notePh': 'Written note (Enter)…',
  'tl.drop': 'Drop photos, videos or screenshots anywhere on the page to add them.',
  'tl.dropNow': 'Drop to add to the session',
  'type.photo': 'Photo', 'type.clip': 'Clip', 'type.screenshot': 'Screenshot', 'type.audio': 'Narration',
  'type.marker': 'Marker', 'type.note': 'Note', 'type.phone_photo': 'Phone photo', 'type.phone_video': 'Phone video',
  'act.narrate': 'Narration', 'act.narrateOn': 'Narrating', 'act.photo': 'Photo', 'act.clip': 'Clip', 'act.marker': 'Marker',
  'act.screen': 'Capture', 'act.phone': 'Phone', 'act.pipTitle': 'Floating toolbar', 'act.generate': 'Generate doc',
  'act.sessions': 'Sessions', 'act.settings': 'Settings',
  'cams.empty': 'No camera open.', 'cams.add': 'Add a camera',
  'cams.hint': 'Shortcuts (page focused): P photo · V clip · M marker · N narration · S capture',
  'err.camera': 'Could not open the camera:',
  'err.mic': 'Could not open the microphone:',
  'err.noCam': 'No camera open. Add one, or connect the phone.',
  'phone.title': 'Connect a phone',
  'phone.how': "Scan this QR code with the phone's camera. The DocMate page opens and connects directly to this computer.",
  'phone.privacy': 'Photos go straight from the phone to the computer (WebRTC). The PeerJS server is only used to introduce the two devices.',
  'phone.photo': 'Photo', 'phone.video': 'Video', 'phone.gallery': 'Gallery', 'phone.marker': 'Marker',
  'phone.live': 'Stream the camera live', 'phone.stopLive': 'Stop streaming', 'phone.liveLabel': 'Phone (live)',
  'phone.notePh': 'Written note…', 'phone.send': 'Send',
  'phone.noHost': 'Incomplete link: scan the QR code shown on the computer.',
  'phone.error': 'Error:', 'phone.connected': 'Connected to the computer', 'phone.reconnecting': 'Reconnecting…',
  'phone.notConnected': 'Not connected to the computer yet.',
  'gen.title': 'Generate documentation', 'gen.profile': 'Output profile', 'gen.project': 'Project',
  'gen.subject': 'Topic (optional)', 'gen.subjectPh': 'e.g. Cannon mounted on the robot',
  'gen.instructions': 'Instructions for the AI (optional)', 'gen.instructionsPh': 'e.g. Focus on the wiring, add a bill of materials.',
  'gen.pickSite': 'Choose the site folder…', 'gen.run': 'Generate', 'gen.docTitle': 'Title', 'gen.state': 'State',
  'gen.next': 'Next step', 'gen.body': 'Body (Markdown) · [[media:ID]] markers will be replaced',
  'gen.regen': 'Regenerate', 'gen.zip': 'Download ZIP', 'gen.write': 'Write to the site folder',
  'gen.empty': 'The session is empty.',
  'gen.summary': '{n} items · {a} narration segment(s)',
  'gen.transcribing': 'Transcribing segment {i}/{n}…',
  'gen.done': 'Draft ready. Review, fix, then write or download.',
  'gen.written': 'Files written:',
  'gen.zipped': 'ZIP downloaded. Unzip it at the root of the site:',
  'gen.noSite': 'No site folder chosen.',
  'gen.site': 'Site folder: {name}',
  'gen.siteHintZip': 'This browser cannot write to a folder: use the ZIP.',
  'gen.examplesAuto': '{n} recent doc(s) from the project used as style reference.',
  'sess.title': 'Sessions',
  'set.title': 'Settings', 'set.ai': 'AI', 'set.stt': 'Transcription', 'set.out': 'Output profile', 'set.cap': 'Capture',
  'set.provider': 'Provider', 'set.model': 'Model', 'set.effort': 'Effort', 'set.key': 'API key',
  'set.baseUrl': 'API URL (empty = OpenAI)', 'set.modelVision': 'Model (with vision)',
  'set.ollamaHint': "Ollama must allow this page: start it with OLLAMA_ORIGINS set to DocMate's address (see README).",
  'set.maxImages': 'Max images sent', 'set.imagePx': 'Image size for the AI (px)',
  'set.keysHint': 'Keys are stored only in this browser and sent only to the chosen provider.',
  'set.sttKey': 'API key (empty = OpenAI key from the AI tab)', 'set.localModel': 'Local model', 'set.language': 'Narration language',
  'set.dup': 'Duplicate', 'set.export': 'Export', 'set.import': 'Import', 'set.reset': 'Reset',
  'set.pName': 'Name', 'set.pDoc': 'Document path', 'set.pAssets': 'Media folder', 'set.pUrl': 'Media URL in the Markdown',
  'set.pProjects': 'Projects folder (list, optional)', 'set.pProjectFile': 'Project file to date (optional)',
  'set.pWebPx': 'Max size of published images (px, 0 = original)', 'set.pImg': 'Image template', 'set.pVid': 'Video template',
  'set.pStyle': 'Style guide', 'set.pExamples': 'Examples of existing docs (the AI imitates their style)',
  'set.addExamples': 'Add .md files', 'set.autoExamples': "With a site folder chosen, recent docs of the same project are added automatically.",
  'set.vars': 'Variables: {project} {date} {slug} {title} {description} {state} {next_step} {session} · media templates: {url} {alt} {caption} {mime}',
  'set.mic': 'Microphone', 'set.clipAudio': 'Sound in video clips', 'set.camW': 'Requested camera width', 'set.camH': 'Requested camera height',
  'set.pickShots': 'Watch a screenshots folder…',
  'set.shotsHint': "During a session, every new screenshot saved to this folder (your system's shortcuts: Print Screen, etc.) is added to the timeline. Chrome, Edge, Opera only.",
  'set.noShots': 'No folder watched.', 'set.shots': 'Watched folder: {name}', 'set.copy': 'copy',
  'set.confirmReset': 'Restore the default profiles? Your edited profiles will be lost.',
  'pip.unavailable': 'The floating toolbar is not available in this browser.',
};

const DICTS = { fr, en };
let lang = 'fr';

function detect() {
  try {
    const s = JSON.parse(localStorage.getItem('docmate.settings') || '{}');
    if (s.lang) return s.lang;
  } catch { /* défaut */ }
  return (navigator.language || 'fr').slice(0, 2) === 'fr' ? 'fr' : 'en';
}

export function t(key, vars = {}) {
  const s = DICTS[lang][key] ?? fr[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

export function applyI18n(root = document) {
  lang = detect();
  document.documentElement.lang = lang;
  if (lang === 'fr') return; // le HTML est déjà en français
  root.querySelectorAll('[data-i18n]').forEach((el) => { const v = DICTS[lang][el.dataset.i18n]; if (v) el.textContent = v; });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => { const v = DICTS[lang][el.dataset.i18nPh]; if (v) el.placeholder = v; });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { const v = DICTS[lang][el.dataset.i18nTitle]; if (v) el.title = v; });
}

export const currentLang = () => lang;

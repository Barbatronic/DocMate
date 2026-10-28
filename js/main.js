// DocMate · point d'entrée de la page principale : branche les modules, puis démarre.
//
//   core/     briques sans dépendance (bus d'événements, DOM, i18n, icônes, réglages, stockage)
//   session/  session courante et ses éléments, transcription des narrations
//   capture/  caméras, micro, narration, écran, import de fichiers
//   phone/    liaison avec le téléphone (télécommande, micro sans fil, caméra en direct)
//   ai/       rédaction par l'IA, transcription
//   output/   profils de sortie, export Markdown / ZIP, export pour un agent
//   ui/       barre d'outils, timeline, vue détaillée, barre flottante, dialogues
//
// Les modules se parlent par le bus (core/bus.js) : une capture annonce `event:added`, et la
// timeline, la barre d'état, la barre flottante et la télécommande se mettent à jour d'elles-mêmes.
import { applyI18n } from './core/i18n.js';
import { applyIcons } from './core/icons.js';
import { persist } from './core/store.js';
import { loadCurrent } from './session/session.js';
import { initAutoTranscription } from './session/transcription.js';
import { initCameras, restoreCameras } from './capture/cameras.js';
import { initRecorder, bootRecorder } from './capture/recorder.js';
import { initImport } from './capture/import.js';
import { initPhone, bootPhone } from './phone/remote.js';
import { initBanner } from './ui/banner.js';
import { initToolbar } from './ui/toolbar.js';
import { initTimeline } from './ui/timeline.js';
import { initDetail } from './ui/detail.js';
import { initPip } from './ui/pip.js';
import { initSessionsDialog } from './ui/sessions-dialog.js';
import { initGenerateDialog, bootGenerateDialog } from './ui/generate-dialog.js';
import { initSettingsDialog } from './ui/settings-dialog.js';

applyIcons();
applyI18n();
persist();

// 1. Interface et écouteurs (rien n'est encore chargé).
initBanner();
initToolbar();
initTimeline();
initDetail();
initPip();
initSessionsDialog();
initGenerateDialog();
initSettingsDialog();
initPhone();
initRecorder();
initCameras();
initImport();
initAutoTranscription();

// 2. Démarrage : narration interrompue récupérée, session courante, téléphone, caméras.
(async function boot() {
  await bootGenerateDialog();
  await bootRecorder();
  await loadCurrent();
  bootPhone();
  await restoreCameras();
})();

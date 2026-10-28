// Détection des fonctions du navigateur (pas du nom du navigateur) :
// un navigateur qui ajoute une fonction plus tard en profite sans mise à jour de DocMate.

export const F = {
  dirWrite: 'showDirectoryPicker' in window,             // écrire dans un dossier (Chromium)
  pip: 'documentPictureInPicture' in window,             // barre flottante au-dessus des autres fenêtres
  displayCapture: !!navigator.mediaDevices?.getDisplayMedia,
  recorder: 'MediaRecorder' in window,
  camera: !!navigator.mediaDevices?.getUserMedia,
  webgpu: 'gpu' in navigator,
  secure: window.isSecureContext,
};

export function pickMime(candidates) {
  return candidates.find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
}

export const VIDEO_MIMES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1,opus',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm',
];
export const AUDIO_MIMES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];

// Bandeau d'état : ce qui est disponible ici, et ce qui ne l'est pas.
export function capabilityReport(t) {
  const missing = [];
  if (!F.secure) missing.push(t('cap.insecure'));
  if (!F.camera || !F.recorder) missing.push(t('cap.noMedia'));
  if (!F.dirWrite) missing.push(t('cap.noDir'));
  if (!F.pip) missing.push(t('cap.noPip'));
  return { ok: missing.length === 0, missing };
}

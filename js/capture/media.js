// Outils image et vidéo (sans dépendance : utilisés aussi par la page téléphone).

export const extOf = (mime) => (mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : mime.includes('png') ? 'png' : mime.includes('jpeg') ? 'jpg' : 'webm');

// Image d'une vidéo en cours, au format JPEG, côté max `maxPx` (0 = pleine résolution).
export async function grabFrame(video, maxPx = 0, quality = 0.92) {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) throw new Error('flux vidéo vide');
  const k = maxPx ? Math.min(1, maxPx / Math.max(w, h)) : 1;
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
}

// Réduit une image (Blob) pour l'IA ou le web. Retourne le blob d'origine s'il est déjà assez petit.
export async function shrink(blob, maxPx, type = 'image/jpeg', quality = 0.85) {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
  if (k === 1 && blob.type === type) return blob;
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return new Promise((r) => c.toBlob(r, type, quality));
}

// Première image utile d'un fichier vidéo (vignette).
export function videoThumb(blob, at = 0.5) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.src = URL.createObjectURL(blob);
    const done = (b) => { URL.revokeObjectURL(v.src); resolve(b); };
    v.onloadeddata = () => { v.currentTime = Math.min(at, (v.duration || 1) / 2); };
    v.onseeked = async () => done(await grabFrame(v, 640, 0.8).catch(() => null));
    v.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
  });
}

// Micro partagé par la narration et le son des clips.
import { S } from '../core/settings.js';

// Source : le micro du téléphone s'il est branché (micro sans fil), sinon celui du PC.
let micStream = null;
let remoteMic = null;
let remoteSink = null;

export function setRemoteMic(stream) {
  remoteMic = stream;
  // Chrome : un flux WebRTC distant n'alimente l'analyseur audio (jauge) que s'il est aussi lu par un élément média.
  if (stream) {
    remoteSink ??= Object.assign(new Audio(), { muted: true });
    remoteSink.srcObject = stream;
    remoteSink.play().catch(() => {});
  } else if (remoteSink) {
    remoteSink.srcObject = null;
  }
}

export const micSource = () => (remoteMic?.active ? 'phone' : 'pc');

export async function getMic() {
  if (remoteMic?.active) return remoteMic;
  if (micStream?.active) return micStream;
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: S.capture.micId ? { deviceId: { exact: S.capture.micId } } : true,
  });
  return micStream;
}

// Coupe le micro du PC (voyant éteint) ; le prochain getMic() prend le micro choisi dans les réglages.
export function releaseMic() {
  micStream?.getTracks().forEach((t) => t.stop());
  micStream = null;
}

// Protocole téléphone <-> PC sur un canal de données WebRTC (PeerJS).
// Les médias vont directement d'un appareil à l'autre ; le serveur PeerJS ne sert qu'à la mise en relation.
//
// Messages : {kind:'hello', now} · {kind:'meta', id, type, t, mime, name, size, chunks}
//            {kind:'chunk', id, i, data:ArrayBuffer} · {kind:'thumb', id, data} · {kind:'marker'|'note', t, text}
//            {kind:'ack', id} (PC -> téléphone)

export const PEERJS = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/+esm';
const CHUNK = 64 * 1024;

export async function sendFile(conn, { id, type, t, mime, name, blob, thumb }, onProgress) {
  const chunks = Math.ceil(blob.size / CHUNK);
  conn.send({ kind: 'meta', id, type, t, mime, name, size: blob.size, chunks });
  if (thumb) conn.send({ kind: 'thumb', id, data: await thumb.arrayBuffer() });
  const dc = conn.dataChannel;
  for (let i = 0; i < chunks; i++) {
    // Contre-pression : ne pas saturer le tampon du canal.
    while (dc && dc.bufferedAmount > 4 * 1024 * 1024) await new Promise((r) => setTimeout(r, 30));
    conn.send({ kind: 'chunk', id, i, data: await blob.slice(i * CHUNK, (i + 1) * CHUNK).arrayBuffer() });
    onProgress?.((i + 1) / chunks);
  }
}

// Côté PC : réassemble les fichiers reçus.
export class Receiver {
  constructor(onFile) {
    this.onFile = onFile;
    this.files = {};
  }
  handle(msg) {
    if (msg.kind === 'meta') this.files[msg.id] = { ...msg, parts: new Array(msg.chunks), got: 0 };
    else if (msg.kind === 'thumb' && this.files[msg.id]) this.files[msg.id].thumb = new Blob([msg.data], { type: 'image/jpeg' });
    else if (msg.kind === 'chunk') {
      const f = this.files[msg.id];
      if (!f || f.parts[msg.i]) return;
      f.parts[msg.i] = msg.data;
      if (++f.got === f.chunks) {
        delete this.files[msg.id];
        const blob = new Blob(f.parts, { type: f.mime });
        this.onFile({ ...f, blob, parts: undefined });
      }
    }
  }
}

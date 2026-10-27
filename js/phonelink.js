// Côté PC : accepte les téléphones (fichiers, repères, flux caméra en direct).
import { PEERJS, Receiver } from './peer-protocol.js';

const ID_KEY = 'docmate.peerId';

export class PhoneLink {
  constructor({ onEvent, onStream, onStatus }) {
    this.onEvent = onEvent;     // ({type, t, ...}, {blob, thumb})
    this.onStream = onStream;   // (MediaStream, label)
    this.onStatus = onStatus;   // (texte)
    this.conns = new Set();
  }

  get phoneUrl() {
    return new URL(`phone.html#${this.id}`, location.href).href;
  }

  async start() {
    if (this.peer) return;
    const { Peer } = await import(PEERJS);
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = 'docmate-' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      localStorage.setItem(ID_KEY, id);
    }
    this.id = id;
    await new Promise((resolve, reject) => {
      this.peer = new Peer(id);
      this.peer.on('open', resolve);
      this.peer.on('error', (e) => {
        if (e.type === 'unavailable-id') {
          // Identifiant déjà pris (autre onglet ouvert ?) : on en tire un nouveau.
          localStorage.removeItem(ID_KEY);
          this.peer.destroy();
          this.peer = null;
          this.start().then(resolve, reject);
        } else {
          this.onStatus?.(`Liaison téléphone : ${e.type}`);
          reject(e);
        }
      });
    });
    this.peer.on('disconnected', () => setTimeout(() => this.peer && !this.peer.destroyed && this.peer.reconnect(), 2000));
    this.peer.on('connection', (conn) => this.accept(conn));
    this.peer.on('call', (call) => {
      call.answer();
      call.on('stream', (s) => this.onStream?.(s, call.metadata?.label || '📱 Téléphone', call));
    });
    this.onStatus?.('Prêt : scannez le QR code avec le téléphone.');
  }

  accept(conn) {
    let offset = 0; // horloge du téléphone -> horloge du PC
    const rx = new Receiver((f) => {
      this.onEvent({ type: f.type, t: f.t + offset, mime: f.mime, name: f.name, source: 'téléphone' }, { blob: f.blob, thumb: f.thumb });
      conn.send({ kind: 'ack', id: f.id });
    });
    conn.on('open', () => {
      this.conns.add(conn);
      this.onStatus?.(`Téléphone connecté (${this.conns.size}).`);
    });
    conn.on('data', (msg) => {
      if (msg.kind === 'hello') offset = Date.now() - msg.now;
      else if (msg.kind === 'marker' || msg.kind === 'note') this.onEvent({ type: msg.kind, t: msg.t + offset, text: msg.text, source: 'téléphone' }, {});
      else rx.handle(msg);
    });
    conn.on('close', () => {
      this.conns.delete(conn);
      this.onStatus?.(this.conns.size ? `Téléphone connecté (${this.conns.size}).` : 'Téléphone déconnecté.');
    });
  }
}

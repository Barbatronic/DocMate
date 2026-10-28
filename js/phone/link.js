// Côté PC : accepte les téléphones (fichiers, repères, télécommande, micro sans fil, caméra en direct).
import { PEERJS, Receiver } from './protocol.js';

const ID_KEY = 'docmate.peerId';
const TOKEN_KEY = 'docmate.phoneToken';

// Jeton d'appairage : dans l'URL du QR code, exigé de chaque téléphone. Gardé le temps de l'onglet
// (sessionStorage) : un ancien QR code ne donne plus accès après la fermeture de l'onglet.
function pairingToken() {
  let tk = sessionStorage.getItem(TOKEN_KEY);
  if (!tk) {
    tk = crypto.randomUUID().replace(/-/g, '');
    sessionStorage.setItem(TOKEN_KEY, tk);
  }
  return tk;
}

export const hasPairedBefore = () => !!localStorage.getItem(ID_KEY);

export class PhoneLink {
  constructor({ onEvent, onStream, onMic, onCommand, onStatus }) {
    this.onEvent = onEvent;     // ({type, t, ...}, {blob, thumb})
    this.onStream = onStream;   // (MediaStream, label, call) : caméra en direct
    this.onMic = onMic;         // (MediaStream | null) : micro sans fil
    this.onCommand = onCommand; // (action) -> Promise : télécommande
    this.onStatus = onStatus;   // (texte, nombre de téléphones)
    this.conns = new Set();
    this.calls = new Set();
    this.micCall = null;
    this.state = null;
    this.token = pairingToken();
  }

  get phoneUrl() {
    return new URL(`phone.html#${this.id}.${this.token}`, location.href).href;
  }

  status(text) {
    this.onStatus?.(text, this.conns.size);
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
          this.status(`Liaison téléphone : ${e.type}`);
          reject(e);
        }
      });
    });
    this.peer.on('disconnected', () => setTimeout(() => this.peer && !this.peer.destroyed && this.peer.reconnect(), 2000));
    this.peer.on('connection', (conn) => this.accept(conn));
    this.peer.on('call', (call) => this.answer(call));
    this.status('Prêt : scannez le QR code avec le téléphone.');
  }

  // Appels média : micro sans fil (audio seul) ou caméra en direct.
  answer(call) {
    const meta = call.metadata || {};
    if (meta.token !== this.token) return call.close();
    call.answer();
    this.calls.add(call);
    call.on('close', () => {
      this.calls.delete(call);
      if (call === this.micCall) {
        this.micCall = null;
        this.onMic?.(null);
      }
    });
    call.on('stream', (s) => {
      if (meta.kind === 'mic') {
        // Un seul micro distant : le plus récent remplace le précédent.
        const old = this.micCall;
        this.micCall = call;
        if (old && old !== call) old.close();
        this.onMic?.(s);
      } else {
        this.onStream?.(s, meta.label || '📱 Téléphone', call);
      }
    });
  }

  // État du PC envoyé aux téléphones (télécommande) : gardé pour les téléphones qui arrivent.
  broadcast(state) {
    this.state = state;
    for (const c of this.conns) if (c.open) c.send({ kind: 'state', ...state });
  }

  accept(conn) {
    let offset = 0; // horloge du téléphone -> horloge du PC
    let paired = false;
    const rx = new Receiver((f) => {
      this.onEvent({ type: f.type, t: f.t + offset, mime: f.mime, name: f.name, source: 'téléphone' }, { blob: f.blob, thumb: f.thumb });
      conn.send({ kind: 'ack', id: f.id });
    });
    conn.on('data', (msg) => {
      if (!paired) {
        // Premier message : `hello` avec le jeton du QR code, sinon la connexion est refusée.
        if (msg?.kind !== 'hello' || msg.token !== this.token) {
          conn.send({ kind: 'denied' });
          setTimeout(() => conn.close(), 500);
          return;
        }
        paired = true;
        offset = Date.now() - msg.now;
        this.conns.add(conn);
        if (this.state) conn.send({ kind: 'state', ...this.state });
        this.status(`Téléphone connecté (${this.conns.size}).`);
        return;
      }
      switch (msg.kind) {
        case 'marker':
        case 'note':
          this.onEvent({ type: msg.kind, t: msg.t + offset, text: msg.text, source: 'téléphone' }, {});
          break;
        case 'cmd':
          Promise.resolve()
            .then(() => this.onCommand?.(msg.action))
            .then(
              () => conn.send({ kind: 'result', id: msg.id, ok: true }),
              (e) => conn.send({ kind: 'result', id: msg.id, ok: false, error: e?.message || String(e) }),
            );
          break;
        case 'stop':
          // Le téléphone coupe son micro ou sa caméra : on ferme l'appel sans attendre la détection réseau.
          for (const c of [...this.calls]) if ((c.metadata?.kind || 'cam') === msg.what) c.close();
          break;
        default:
          rx.handle(msg);
      }
    });
    conn.on('close', () => {
      if (!this.conns.delete(conn)) return;
      this.status(this.conns.size ? `Téléphone connecté (${this.conns.size}).` : 'Téléphone déconnecté.');
    });
  }
}

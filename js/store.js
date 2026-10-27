// Stockage local (IndexedDB) : sessions, événements de la timeline, fichiers (blobs), poignées de dossiers.
// Tout reste dans le navigateur de l'utilisateur.

const DB_NAME = 'docmate';
const DB_VERSION = 1;
let dbPromise;

function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      d.createObjectStore('sessions', { keyPath: 'id' });
      d.createObjectStore('events', { keyPath: 'id' }).createIndex('session', 'sessionId');
      d.createObjectStore('blobs');
      d.createObjectStore('handles');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => resolve(out instanceof IDBRequest ? out.result : out);
    t.onerror = () => reject(t.error);
  });
}

export const uid = (prefix = '') => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const putSession = (s) => tx('sessions', 'readwrite', (st) => st.put(s));
export const getSession = (id) => tx('sessions', 'readonly', (st) => st.get(id));
export const listSessions = async () =>
  (await tx('sessions', 'readonly', (st) => st.getAll())).sort((a, b) => b.started - a.started);

export const putEvent = (e) => tx('events', 'readwrite', (st) => st.put(e));
export const listEvents = async (sessionId) =>
  (await tx('events', 'readonly', (st) => st.index('session').getAll(sessionId))).sort((a, b) => a.t - b.t);

export const putBlob = async (blob, id = uid('b')) => {
  await tx('blobs', 'readwrite', (st) => st.put(blob, id));
  return id;
};
export const getBlob = (id) => tx('blobs', 'readonly', (st) => st.get(id));
const delBlob = (id) => tx('blobs', 'readwrite', (st) => st.delete(id));

export async function deleteEvent(ev) {
  for (const b of [ev.blobId, ev.thumbId, ...(ev.keyframes || [])].filter(Boolean)) await delBlob(b);
  await tx('events', 'readwrite', (st) => st.delete(ev.id));
}

export async function deleteSession(id) {
  for (const ev of await listEvents(id)) await deleteEvent(ev);
  await tx('sessions', 'readwrite', (st) => st.delete(id));
}

export const putHandle = (name, h) => tx('handles', 'readwrite', (st) => st.put(h, name));
export const getHandle = (name) => tx('handles', 'readonly', (st) => st.get(name));
export const delHandle = (name) => tx('handles', 'readwrite', (st) => st.delete(name));

// Demande au navigateur de ne pas purger les données en cas de manque de place.
export const persist = () => navigator.storage?.persist?.().catch(() => false);

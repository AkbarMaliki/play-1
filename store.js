// Penyimpanan lokal sederhana (IndexedDB) untuk BIOS, memory card, dan save state.
// Semua data hanya ada di browser ini, tidak pernah dikirim ke server mana pun.

const DB_NAME = 'play-1';
const STORE = 'kv';

let dbPromise;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

export async function get(key) {
  try {
    return await run('readonly', (s) => s.get(key));
  } catch {
    return undefined;
  }
}

export const set = (key, value) => run('readwrite', (s) => s.put(value, key));
export const del = (key) => run('readwrite', (s) => s.delete(key));

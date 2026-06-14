const DB_NAME = "framecut-browser-media";
const DB_VERSION = 1;
const STORE_ORIGINALS = "originals";
const STORE_SONGS = "songs";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_ORIGINALS)) {
        db.createObjectStore(STORE_ORIGINALS);
      }
      if (!db.objectStoreNames.contains(STORE_SONGS)) {
        db.createObjectStore(STORE_SONGS);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open browser media store"));
  });

  return dbPromise;
}

async function putBlob(storeName: string, id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Browser media store transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("Browser media store transaction aborted"));
  });
}

async function getBlob(storeName: string, id: string): Promise<Blob | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).get(id);
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(request.error ?? new Error("Unable to read browser media store"));
  });
}

export async function storeOriginal(id: string, blob: Blob): Promise<void> {
  await putBlob(STORE_ORIGINALS, id, blob);
}

export async function getOriginal(id: string): Promise<Blob | undefined> {
  return getBlob(STORE_ORIGINALS, id);
}

export async function storeSong(id: string, blob: Blob): Promise<void> {
  await putBlob(STORE_SONGS, id, blob);
}

export async function getSong(id: string): Promise<Blob | undefined> {
  return getBlob(STORE_SONGS, id);
}

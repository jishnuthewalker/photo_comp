import { createBrowserImportFingerprint, type ImportedPhoto } from "./photoImport";

const DB_NAME = "framecut-browser-import-cache";
const DB_VERSION = 1;
const STORE_NAME = "photos";

export interface BrowserImportCacheRecord {
  fingerprint: string;
  originalPath: string;
  displayName: string;
  thumbBlob: Blob;
  width: number;
  height: number;
  normalizedPath: string;
  contentHash?: string;
}

export interface BrowserImportCacheHit {
  file: File;
  record: BrowserImportCacheRecord;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "fingerprint" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open browser import cache"));
  });

  return dbPromise;
}

async function getStore(mode: IDBTransactionMode) {
  const db = await openDatabase();
  const tx = db.transaction(STORE_NAME, mode);
  return { db, store: tx.objectStore(STORE_NAME), tx };
}

export function fingerprintFile(file: Pick<File, "name" | "size" | "lastModified">) {
  return createBrowserImportFingerprint(file);
}

export async function readCachedImportRecord(file: File) {
  const { store, tx } = await getStore("readonly");
  const record = await new Promise<BrowserImportCacheRecord | undefined>((resolve, reject) => {
    const request = store.get(fingerprintFile(file));
    request.onsuccess = () => resolve(request.result as BrowserImportCacheRecord | undefined);
    request.onerror = () => reject(request.error ?? new Error("Unable to read browser import cache"));
  });

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Browser import cache transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("Browser import cache transaction aborted"));
  }).catch(() => undefined);

  return record ?? null;
}

export async function writeCachedImportRecord(record: BrowserImportCacheRecord) {
  const { store, tx } = await getStore("readwrite");
  await new Promise<void>((resolve, reject) => {
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Unable to write browser import cache"));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Browser import cache transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("Browser import cache transaction aborted"));
  });
}

export async function readCachedImportedPhoto(file: File) {
  const record = await readCachedImportRecord(file);
  if (!record) return null;
  const thumbPath = URL.createObjectURL(record.thumbBlob);
  const importedPhoto: ImportedPhoto = {
    originalPath: record.originalPath,
    displayName: record.displayName,
    thumbPath,
    width: record.width,
    height: record.height,
    normalizedPath: record.normalizedPath,
    contentHash: record.contentHash,
  };
  return importedPhoto;
}

export async function storeImportedPhotoCache(file: File, photo: ImportedPhoto, thumbBlob: Blob) {
  const record: BrowserImportCacheRecord = {
    fingerprint: fingerprintFile(file),
    originalPath: photo.originalPath,
    displayName: photo.displayName ?? file.name,
    thumbBlob,
    width: photo.width,
    height: photo.height,
    normalizedPath: photo.normalizedPath ?? fingerprintFile(file),
    contentHash: photo.contentHash,
  };
  await writeCachedImportRecord(record);
}

export async function updateCachedContentHash(file: File, contentHash: string) {
  const record = await readCachedImportRecord(file);
  if (!record) return;
  await writeCachedImportRecord({ ...record, contentHash });
}

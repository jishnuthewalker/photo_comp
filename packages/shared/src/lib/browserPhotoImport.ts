import { createBrowserImportFingerprint, type ImportedPhoto } from "./photoImport";

export interface BrowserImportBatch {
  photos: BrowserImportedPhotoDraft[];
  files: File[];
  processed: number;
  total: number;
}

export interface BrowserImportedPhotoDraft {
  originalPath: string;
  displayName: string;
  importId: string;
  thumbBlob: Blob;
  width: number;
  height: number;
  normalizedPath: string;
}

export interface BrowserImportCallbacks {
  onBatch: (batch: BrowserImportBatch) => void;
  onProgress?: (processed: number, total: number) => void;
  onDone?: () => void;
  onError?: (error: string) => void;
}

export interface BrowserDuplicateFingerprint {
  normalizedPath: string;
  contentHash: string;
}

interface ImportFilesMessage {
  type: "import";
  sessionId: number;
  files: File[];
  thumbSize: number;
  batchSize: number;
}

interface HashFilesMessage {
  type: "hash";
  sessionId: number;
  files: File[];
}

interface CancelMessage {
  type: "cancel";
  sessionId: number;
}

type WorkerRequest = ImportFilesMessage | HashFilesMessage | CancelMessage;

type WorkerResponse =
  | { type: "batch"; sessionId: number; photos: BrowserImportedPhotoDraft[]; processed: number; total: number }
  | { type: "progress"; sessionId: number; processed: number; total: number }
  | { type: "done"; sessionId: number }
  | { type: "hashResult"; sessionId: number; fingerprints: BrowserDuplicateFingerprint[] }
  | { type: "error"; sessionId: number; error: string };

let nextSessionId = 1;

function createWorker() {
  return new Worker(new URL("../workers/photoImport.worker.ts", import.meta.url), { type: "module" });
}

export function startBrowserPhotoImport(
  files: File[],
  thumbSize: number,
  callbacks: BrowserImportCallbacks,
  batchSize = 8
) {
  const sessionId = nextSessionId++;
  const worker = createWorker();
  let activeHashWorker: Worker | null = null;
  let activeHashReject: ((reason?: unknown) => void) | null = null;
  let finished = false;

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    if (message.sessionId !== sessionId || finished) return;

    if (message.type === "batch") {
      const start = message.processed - message.photos.length;
      callbacks.onBatch({
        photos: message.photos,
        files: files.slice(start, message.processed),
        processed: message.processed,
        total: message.total,
      });
      callbacks.onProgress?.(message.processed, message.total);
      return;
    }

    if (message.type === "progress") {
      callbacks.onProgress?.(message.processed, message.total);
      return;
    }

    if (message.type === "hashResult") {
      callbacks.onDone?.();
      finished = true;
      worker.terminate();
      return;
    }

    if (message.type === "done") {
      callbacks.onDone?.();
      finished = true;
      worker.terminate();
      return;
    }

    callbacks.onError?.(message.error);
    finished = true;
    worker.terminate();
  };

  worker.onerror = (event) => {
    if (finished) return;
    finished = true;
    callbacks.onError?.(event.message ?? "Browser import failed");
    worker.terminate();
  };

  const request: WorkerRequest = {
    type: "import",
    sessionId,
    files,
    thumbSize,
    batchSize,
  };

  worker.postMessage(request);

  return {
    cancel() {
      if (finished) return;
      finished = true;
      const cancelMessage: CancelMessage = { type: "cancel", sessionId };
      worker.postMessage(cancelMessage);
      worker.terminate();
      activeHashReject?.(new Error("Browser duplicate analysis cancelled"));
      activeHashReject = null;
      activeHashWorker?.terminate();
      activeHashWorker = null;
    },
    hashFiles(hashTargets: File[]) {
      return new Promise<BrowserDuplicateFingerprint[]>((resolve, reject) => {
        const hashWorker = createWorker();
        activeHashReject?.(new Error("Browser duplicate analysis replaced by a new run"));
        activeHashReject = null;
        activeHashWorker?.terminate();
        activeHashWorker = hashWorker;
        activeHashReject = reject;
        const hashSessionId = nextSessionId++;
        let settled = false;

        hashWorker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          const message = event.data;
          if (message.sessionId !== hashSessionId || settled) return;

          if (message.type === "hashResult") {
            settled = true;
            hashWorker.terminate();
            if (activeHashWorker === hashWorker) {
              activeHashWorker = null;
            }
            if (activeHashReject === reject) {
              activeHashReject = null;
            }
            resolve(message.fingerprints);
            return;
          }

          if (message.type === "error") {
            settled = true;
            hashWorker.terminate();
            if (activeHashWorker === hashWorker) {
              activeHashWorker = null;
            }
            if (activeHashReject === reject) {
              activeHashReject = null;
            }
            reject(new Error(message.error));
          }
        };

        hashWorker.onerror = (event) => {
          if (settled) return;
          settled = true;
          hashWorker.terminate();
          if (activeHashWorker === hashWorker) {
            activeHashWorker = null;
          }
          if (activeHashReject === reject) {
            activeHashReject = null;
          }
          reject(new Error(event.message ?? "Browser hash analysis failed"));
        };

        const request: HashFilesMessage = {
          type: "hash",
          sessionId: hashSessionId,
          files: hashTargets,
        };

        hashWorker.postMessage(request);
      });
    },
  };
}

export function createBrowserImportedPhoto(file: File, thumbUrl: string, width: number, height: number): ImportedPhoto {
  return {
    originalPath: file.name,
    displayName: file.name,
    thumbPath: thumbUrl,
    width,
    height,
    normalizedPath: createBrowserImportFingerprint(file),
  };
}

import { createBrowserImportFingerprint } from "../lib/photoImport";
import type {
  BrowserDuplicateFingerprint,
  BrowserImportedPhotoDraft,
} from "../lib/browserPhotoImport";

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

const cancelledSessions = new Set<number>();

function post(message: WorkerResponse) {
  self.postMessage(message);
}

function isCancelled(sessionId: number) {
  return cancelledSessions.has(sessionId);
}

function toThumbSize(width: number, height: number, maxSize: number) {
  if (width <= 0 || height <= 0) return { width: maxSize, height: maxSize };
  const scale = Math.min(1, maxSize / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function decodeFileToBitmap(file: File) {
  try {
    return await createImageBitmap(file);
  } catch (initialError) {
    const ImageDecoderCtor = (globalThis as typeof globalThis & { ImageDecoder?: new (options: any) => any }).ImageDecoder;
    if (!ImageDecoderCtor) {
      throw initialError;
    }

    const decoder = new ImageDecoderCtor({ data: file, type: file.type || "image/jpeg" });
    try {
      const result = await decoder.decode();
      const bitmap = await createImageBitmap(result.image);
      result.image.close?.();
      return bitmap;
    } finally {
      decoder.close?.();
    }
  }
}

async function fileToThumb(file: File, thumbSize: number) {
  const bitmap = await decodeFileToBitmap(file);
  try {
    const { width, height } = toThumbSize(bitmap.width, bitmap.height, thumbSize);
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Browser canvas context unavailable");
    }
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.88 });
    return { blob, width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

async function importFiles(sessionId: number, files: File[], thumbSize: number, batchSize: number) {
  const total = files.length;
  let processed = 0;

  for (let i = 0; i < files.length; i += batchSize) {
    if (isCancelled(sessionId)) return;
    const chunk = files.slice(i, i + batchSize);
    const batch = await Promise.all(chunk.map(async (file) => {
      const importId = crypto.randomUUID();
      processed += 1;
      const thumb = await fileToThumb(file, thumbSize);
      return {
        originalPath: importId,
        displayName: file.name,
        importId,
        thumbBlob: thumb.blob,
        width: thumb.width,
        height: thumb.height,
        normalizedPath: createBrowserImportFingerprint(file),
      } satisfies BrowserImportedPhotoDraft;
    }));

    post({ type: "batch", sessionId, photos: batch, processed, total });
    post({ type: "progress", sessionId, processed, total });
  }

  if (!isCancelled(sessionId)) {
    post({ type: "done", sessionId });
  }
}

async function hashFiles(sessionId: number, files: File[]) {
  const total = files.length;
  const fingerprints: BrowserDuplicateFingerprint[] = [];

  for (let i = 0; i < files.length; i += 1) {
    if (isCancelled(sessionId)) return;
    const file = files[i];
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    fingerprints.push({
      normalizedPath: createBrowserImportFingerprint(file),
      contentHash: hash,
    });
    post({ type: "progress", sessionId, processed: i + 1, total });
  }

  if (!isCancelled(sessionId)) {
    post({ type: "hashResult", sessionId, fingerprints });
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  if (message.type === "cancel") {
    cancelledSessions.add(message.sessionId);
    return;
  }

  try {
    if (message.type === "import") {
      cancelledSessions.delete(message.sessionId);
      await importFiles(message.sessionId, message.files, message.thumbSize, message.batchSize);
      return;
    }

    cancelledSessions.delete(message.sessionId);
    await hashFiles(message.sessionId, message.files);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    post({ type: "error", sessionId: message.sessionId, error: messageText });
  }
};

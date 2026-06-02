import type {
  PickedFile,
  DuplicateReport,
  DuplicateGroup,
} from "@framecut/shared/lib/platform/types";
import type { Photo, PhotoMeta } from "@framecut/shared/store/types";
import { storeOriginal, getOriginal } from "./idb";

const THUMB_SIZE = 240;
const WORKER_POOL_SIZE = 4;

// Worker pool for parallel thumbnail generation
let workerPool: Worker[] | null = null;
function getWorkerPool(): Worker[] {
  if (!workerPool) {
    workerPool = Array.from({ length: WORKER_POOL_SIZE }, () =>
      new Worker(new URL("./thumbnail.worker.ts", import.meta.url), {
        type: "module",
      })
    );
  }
  return workerPool;
}

// Round-robin worker dispatch
let workerIdx = 0;
function getNextWorker(): Worker {
  const pool = getWorkerPool();
  const w = pool[workerIdx % pool.length];
  workerIdx++;
  return w;
}

async function generateThumbnail(
  id: string,
  blob: Blob
): Promise<{ thumbBlob: Blob; origWidth: number; origHeight: number }> {
  return new Promise((resolve, reject) => {
    const worker = getNextWorker();
    const handler = (e: MessageEvent) => {
      if (e.data.id !== id) return;
      worker.removeEventListener("message", handler);
      if (e.data.error) reject(new Error(e.data.error));
      else
        resolve({
          thumbBlob: e.data.thumbBlob,
          origWidth: e.data.origWidth,
          origHeight: e.data.origHeight,
        });
    };
    worker.addEventListener("message", handler);
    worker.postMessage({ id, blob, maxSize: THUMB_SIZE });
  });
}

// Convert HEIC blob to JPEG using heic-to library
async function convertHeic(blob: Blob): Promise<Blob> {
  // Dynamic import to keep heic-to out of the initial bundle
  const { heicTo } = await import("heic-to");
  return heicTo({ blob, type: "image/jpeg", quality: 0.9 });
}

function isHeic(file: File): boolean {
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    file.name.toLowerCase().endsWith(".heic") ||
    file.name.toLowerCase().endsWith(".heif")
  );
}

export async function pickImageFiles(): Promise<PickedFile[]> {
  // Try File System Access API first
  if ("showOpenFilePicker" in window) {
    try {
      const handles = await (
        window as unknown as {
          showOpenFilePicker: (opts: unknown) => Promise<FileSystemFileHandle[]>;
        }
      ).showOpenFilePicker({
        multiple: true,
        types: [
          {
            description: "Images",
            accept: {
              "image/*": [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"],
            },
          },
        ],
      });
      const files: File[] = await Promise.all(handles.map((h) => h.getFile()));
      return files.map((f) => ({ kind: "file" as const, file: f, name: f.name }));
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return [];
      // Fall through to input fallback
    }
  }

  // Fallback: hidden <input type="file">
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/*,.heic,.heif";
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      resolve(files.map((f) => ({ kind: "file" as const, file: f, name: f.name })));
    };
    // oncancel may not fire in all browsers — attach to body click as fallback
    input.addEventListener("cancel", () => resolve([]));
    input.click();
  });
}

export async function importImages(
  files: PickedFile[],
  onProgress?: (done: number, total: number) => void
): Promise<PhotoMeta[]> {
  // Extract File objects
  const fileObjects: { id: string; file: File }[] = [];
  for (const pf of files) {
    if (pf.kind === "file") {
      fileObjects.push({ id: crypto.randomUUID(), file: pf.file });
    }
    // path kind is desktop-only; on web all picked files are kind:"file"
  }

  const total = fileObjects.length;
  let done = 0;
  const results: PhotoMeta[] = [];

  // Process files (memory-bounded parallelism via Promise.all)
  await Promise.all(
    fileObjects.map(async ({ id, file }) => {
      let blob: Blob = file;
      let heic = false;

      if (isHeic(file)) {
        heic = true;
        blob = await convertHeic(file);
      }

      const { thumbBlob, origWidth, origHeight } = await generateThumbnail(id, blob);

      // Store original (post-HEIC-conversion) blob in IDB for full-res export
      await storeOriginal(id, blob);

      // Create blob URLs for display
      const thumbUrl = URL.createObjectURL(thumbBlob);

      results.push({
        originalPath: id, // IDB key — used by platform.assetUrl() and export
        thumbPath: thumbUrl, // blob URL for direct display
        width: origWidth,
        height: origHeight,
        heicPaths: heic ? [file.name] : [],
      });

      done++;
      onProgress?.(done, total);
    })
  );

  return results;
}

export async function analyzeDuplicates(photos: Photo[]): Promise<DuplicateReport> {
  // SHA-256 hash each original blob from IDB
  const entries: { id: string; path: string; hash: string }[] = [];

  await Promise.all(
    photos.map(async (photo) => {
      const blob = await getOriginal(photo.originalPath);
      if (!blob) return;
      const bytes = await blob.arrayBuffer();
      const hashBuf = await crypto.subtle.digest("SHA-256", bytes);
      const hash = Array.from(new Uint8Array(hashBuf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      entries.push({
        id: photo.id ?? photo.originalPath,
        path: photo.originalPath.toLowerCase(),
        hash,
      });
    })
  );

  // Group by path (path duplicates)
  const pathGroups = new Map<string, typeof entries>();
  for (const e of entries) {
    const group = pathGroups.get(e.path) ?? [];
    group.push(e);
    pathGroups.set(e.path, group);
  }

  // Group by hash (content duplicates — different paths, same content)
  const hashGroups = new Map<string, typeof entries>();
  for (const e of entries) {
    const group = hashGroups.get(e.hash) ?? [];
    group.push(e);
    hashGroups.set(e.hash, group);
  }

  const groups: DuplicateGroup[] = [];
  let pathDuplicateCount = 0;
  let contentDuplicateCount = 0;

  for (const group of pathGroups.values()) {
    if (group.length > 1) {
      const photoGroup = group
        .map((e) => photos.find((p) => p.originalPath === e.path)!)
        .filter(Boolean);
      groups.push({ type: "path", photos: photoGroup });
      pathDuplicateCount += group.length - 1;
    }
  }

  for (const group of hashGroups.values()) {
    if (group.length > 1) {
      // Only flag as content dup if paths are distinct (path dups already captured)
      const distinct = [...new Set(group.map((e) => e.path))];
      if (distinct.length > 1) {
        const photoGroup = group
          .map((e) => photos.find((p) => p.originalPath === e.id)!)
          .filter(Boolean);
        groups.push({ type: "content", photos: photoGroup });
        contentDuplicateCount += group.length - 1;
      }
    }
  }

  return { groups, pathDuplicateCount, contentDuplicateCount };
}

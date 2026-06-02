import type {
  Platform,
  PickedFile,
  SongRef,
  DuplicateReport,
  RenderRequest,
  RenderResult,
} from "@framecut/shared/lib/platform/types";
import type { Photo, RenderProgress } from "@framecut/shared/store/types";
import {
  pickImageFiles,
  importImages,
  analyzeDuplicates,
} from "./import";
import { loadAudio, pickSongFile } from "./audio";
import { saveProject, loadProject } from "./files";
import { renderVideo, cancelRender } from "./render";

/**
 * DOM drag-and-drop handler with recursive folder traversal.
 * Returns an unsubscribe function.
 */
function onFileDrop(cb: (files: PickedFile[]) => void): () => void {
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer) return;

    const files: File[] = [];

    async function readEntry(entry: FileSystemEntry): Promise<void> {
      if (entry.isFile) {
        const file = await new Promise<File>((res, rej) =>
          (entry as FileSystemFileEntry).file(res, rej)
        );
        if (/\.(jpg|jpeg|png|webp|heic|heif)$/i.test(file.name)) {
          files.push(file);
        }
      } else if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        const entries = await new Promise<FileSystemEntry[]>((res, rej) =>
          reader.readEntries(res, rej)
        );
        for (const e of entries) {
          await readEntry(e);
        }
      }
    }

    const items = Array.from(e.dataTransfer.items);
    for (const item of items) {
      if (item.kind === "file") {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          await readEntry(entry);
        }
      }
    }

    if (files.length > 0) {
      cb(files.map((f) => ({ kind: "file" as const, file: f, name: f.name })));
    }
  };

  window.addEventListener("dragover", handleDragOver);
  window.addEventListener("drop", handleDrop);

  return () => {
    window.removeEventListener("dragover", handleDragOver);
    window.removeEventListener("drop", handleDrop);
  };
}

export const webPlatform: Platform = {
  async checkBackendReady(): Promise<void> {
    // Check WebCodecs support (H.264 encoding)
    if (typeof VideoEncoder === "undefined") {
      console.warn(
        "VideoEncoder not available. Export will not work. Please use Chrome or Edge."
      );
    }
  },

  pickImageFiles,
  importImages,
  analyzeDuplicates,

  pickSongFile,

  loadAudio,

  onFileDrop,

  saveProject,
  loadProject,

  async renderVideo(
    req: RenderRequest,
    onProgress: (p: RenderProgress) => void
  ): Promise<RenderResult> {
    return renderVideo(req, onProgress);
  },

  async cancelRender(renderId: string): Promise<void> {
    return cancelRender(renderId);
  },

  async revealOutput(_result: RenderResult): Promise<void> {
    // Web: no-op — download triggered inline by render pipeline
  },

  assetUrl(ref: string): string {
    // On web, refs are either blob: URLs (thumbnails) or IDB keys (originals).
    // Thumbnails already have blob: URLs; original IDB keys need object URLs
    // from getOriginal(). For display, thumbPath is always a blob: URL.
    return ref;
  },
};

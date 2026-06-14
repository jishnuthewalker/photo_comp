import { storeSong, getSong } from "./idb";
import type { PickedFile, SongRef } from "@framecut/shared/lib/platform/types";

/**
 * In-session song store: uuid → File (for fast access before IDB write completes).
 * Keyed by the same UUID that is returned as the song path so that loadAudio()
 * can resolve the audio bytes without waiting for the IDB write.
 */
const sessionSongs = new Map<string, File>();

/**
 * Show an audio file picker, store the selected file in the session map and IDB,
 * and return a { kind: "path", path: uuid } reference.
 *
 * Returning kind:"path" ensures the shared BpmControls code passes `picked.path`
 * (the UUID) as the song ref, which loadAudio() can then resolve correctly.
 *
 * Returns null if the user cancels.
 */
export async function pickSongFile(): Promise<PickedFile | null> {
  let file: File | null = null;

  // Try File System Access API first
  if ("showOpenFilePicker" in window) {
    try {
      const [handle] = await (
        window as unknown as {
          showOpenFilePicker: (opts: unknown) => Promise<FileSystemFileHandle[]>;
        }
      ).showOpenFilePicker({
        types: [
          {
            description: "Audio",
            accept: {
              "audio/*": [".mp3", ".wav", ".aac", ".m4a", ".ogg", ".flac"],
            },
          },
        ],
      });
      file = await handle.getFile();
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return null;
      // Fall through to input fallback
    }
  }

  // Fallback: hidden <input type="file">
  if (!file) {
    file = await new Promise<File | null>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "audio/*";
      input.onchange = () => {
        resolve(input.files?.[0] ?? null);
      };
      input.addEventListener("cancel", () => resolve(null));
      input.click();
    });
  }

  if (!file) return null;

  const uuid = crypto.randomUUID();

  // Store in session map immediately for synchronous-ish access
  sessionSongs.set(uuid, file);

  // Store in IDB asynchronously for persistence across page reloads
  // (fire-and-forget — session map serves fast access)
  storeSong(uuid, file).catch((err) => {
    console.warn("[audio] IDB song store failed:", err);
  });

  return { kind: "path" as const, path: uuid };
}

/**
 * Load audio bytes for decoding (e.g., for BPM detection).
 * Looks up the UUID from the session map first, then falls back to IDB.
 */
export async function loadAudio(ref: SongRef): Promise<ArrayBuffer> {
  // Fast path: still in session memory
  const file = sessionSongs.get(ref.ref);
  if (file) return file.arrayBuffer();

  // Slow path: retrieve from IDB (e.g., after page reload)
  const blob = await getSong(ref.ref);
  if (!blob) throw new Error(`Song not found: ${ref.ref}`);
  return blob.arrayBuffer();
}

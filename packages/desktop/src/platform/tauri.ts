import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { listen } from "@tauri-apps/api/event";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type {
  Platform,
  PickedFile,
  SongRef,
  DuplicateReport,
  RenderRequest,
  RenderResult,
} from "@framecut/shared/lib/platform";
import type {
  Photo,
  PhotoMeta,
  RenderProgress,
  Project,
} from "@framecut/shared/store/types";
import {
  buildFrameCounts,
} from "@framecut/shared/lib/cumulativeTimeline";

// ---------------------------------------------------------------------------
// Internal types mirroring the Rust serialised structs
// ---------------------------------------------------------------------------

interface TauriImportResult {
  photos: { originalPath: string; thumbPath: string; width: number; height: number }[];
  heicPaths: string[];
}

interface TauriDuplicateFingerprint {
  normalizedPath: string;
  contentHash: string;
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

/** Remembered after the first explicit save so autosave can skip the dialog. */
let _savedProjectPath: string | null = null;

// ---------------------------------------------------------------------------
// Resolution map
// ---------------------------------------------------------------------------

const RESOLUTION_MAP = {
  "720p": [1280, 720],
  "1080p": [1920, 1080],
  "4k": [3840, 2160],
} as const;

// ---------------------------------------------------------------------------
// TauriPlatform implementation
// ---------------------------------------------------------------------------

export class TauriPlatform implements Platform {
  // ── Backend readiness ─────────────────────────────────────────────────────

  async checkBackendReady(): Promise<void> {
    await invoke<void>("check_ffmpeg");
  }

  // ── Image file picking & import ───────────────────────────────────────────

  async pickImageFiles(): Promise<PickedFile[]> {
    const result = await open({
      multiple: true,
      directory: false,
      filters: [
        {
          name: "Images",
          extensions: ["jpg", "jpeg", "png", "webp", "heic", "heif"],
        },
      ],
    });
    if (!result) return [];
    const paths = Array.isArray(result) ? result : [result];
    return paths.map((path) => ({ kind: "path" as const, path }));
  }

  async importImages(
    files: PickedFile[],
    _onProgress?: (done: number, total: number) => void
  ): Promise<PhotoMeta[]> {
    const paths = files
      .filter((f): f is Extract<PickedFile, { kind: "path" }> => f.kind === "path")
      .map((f) => f.path);

    let result = await invoke<TauriImportResult>("import_images", {
      paths,
      thumbSize: 240,
    });

    // If HEIC files were detected, convert them then re-import
    if (result.heicPaths.length > 0) {
      const converted = await invoke<string[]>("convert_heic", {
        heicPaths: result.heicPaths,
      });
      const convertedResult = await invoke<TauriImportResult>("import_images", {
        paths: converted,
        thumbSize: 240,
      });
      result = {
        photos: [...result.photos, ...convertedResult.photos],
        heicPaths: [],
      };
    }

    return result.photos.map((p) => ({
      originalPath: p.originalPath,
      thumbPath: p.thumbPath,
      width: p.width,
      height: p.height,
      heicPaths: [],
    }));
  }

  // ── Duplicate analysis ────────────────────────────────────────────────────

  async analyzeDuplicates(photos: Photo[]): Promise<DuplicateReport> {
    const paths = photos.map((p) => p.originalPath);
    const fingerprints = await invoke<TauriDuplicateFingerprint[]>(
      "analyze_duplicates",
      { paths }
    );

    // Build path-duplicate groups (same normalizedPath, different array index)
    const byPath = new Map<string, number[]>(); // normalizedPath → indices
    fingerprints.forEach((fp, i) => {
      const arr = byPath.get(fp.normalizedPath) ?? [];
      arr.push(i);
      byPath.set(fp.normalizedPath, arr);
    });

    // Build content-duplicate groups (same hash, different normalizedPath)
    const byHash = new Map<string, Set<string>>(); // hash → set of normalizedPaths
    fingerprints.forEach((fp) => {
      const set = byHash.get(fp.contentHash) ?? new Set<string>();
      set.add(fp.normalizedPath);
      byHash.set(fp.contentHash, set);
    });

    const groups: DuplicateReport["groups"] = [];
    let pathDuplicateCount = 0;
    let contentDuplicateCount = 0;

    // Path duplicates: indices sharing the same normalizedPath
    for (const indices of byPath.values()) {
      if (indices.length > 1) {
        const dupePhotos = indices.map((i) => photos[i]);
        groups.push({ type: "path", photos: dupePhotos });
        pathDuplicateCount += indices.length - 1;
      }
    }

    // Content duplicates: distinct paths that share the same hash
    for (const [hash, normalizedPaths] of byHash.entries()) {
      if (normalizedPaths.size > 1) {
        // Collect one representative photo per distinct normalizedPath
        const seen = new Set<string>();
        const dupePhotos: Photo[] = [];
        fingerprints.forEach((fp, i) => {
          if (fp.contentHash === hash && !seen.has(fp.normalizedPath)) {
            seen.add(fp.normalizedPath);
            dupePhotos.push(photos[i]);
          }
        });
        groups.push({ type: "content", photos: dupePhotos });
        contentDuplicateCount += normalizedPaths.size - 1;
      }
    }

    return { groups, pathDuplicateCount, contentDuplicateCount };
  }

  // ── Song file picking & audio loading ─────────────────────────────────────

  async pickSongFile(): Promise<PickedFile | null> {
    const result = await open({
      multiple: false,
      filters: [
        {
          name: "Audio",
          extensions: ["mp3", "aac", "wav", "flac", "m4a", "ogg"],
        },
      ],
    });
    if (!result || Array.isArray(result)) return null;
    return { kind: "path" as const, path: result };
  }

  async loadAudio(ref: SongRef): Promise<ArrayBuffer> {
    const url = convertFileSrc(ref.ref);
    const response = await fetch(url);
    return response.arrayBuffer();
  }

  // ── File drop ─────────────────────────────────────────────────────────────

  onFileDrop(cb: (files: PickedFile[]) => void): () => void {
    let unlistenFn: (() => void) | null = null;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "drop") {
          const paths: string[] = (event.payload as { type: "drop"; paths: string[] }).paths ?? [];
          const files: PickedFile[] = paths.map((path) => ({
            kind: "path" as const,
            path,
          }));
          if (files.length > 0) cb(files);
        }
      })
      .then((unlisten) => {
        unlistenFn = unlisten;
      });

    return () => {
      unlistenFn?.();
    };
  }

  // ── Project persistence ───────────────────────────────────────────────────

  async saveProject(project: Project): Promise<string> {
    // Use remembered path for autosave; prompt on first save
    let path = _savedProjectPath;
    if (!path) {
      const picked = await save({
        filters: [{ name: "Framecut Project", extensions: ["framecut"] }],
      });
      if (!picked) throw new Error("cancelled");
      path = picked;
    }
    await writeTextFile(path, JSON.stringify(project, null, 2));
    _savedProjectPath = path;
    return path;
  }

  async loadProject(): Promise<Project | null> {
    const result = await open({
      filters: [
        { name: "Framecut Project", extensions: ["framecut", "photocomp"] },
      ],
    });
    if (!result || Array.isArray(result)) return null;
    const path = result as string;
    const text = await readTextFile(path);
    const project = JSON.parse(text) as Project;
    if (project.schemaVersion !== 1)
      throw new Error(`Unknown schema version: ${project.schemaVersion}`);
    _savedProjectPath = path;
    return project;
  }

  // ── Video render ──────────────────────────────────────────────────────────

  async renderVideo(
    req: RenderRequest,
    onProgress: (p: RenderProgress) => void
  ): Promise<RenderResult> {
    const [width, height] = RESOLUTION_MAP[req.resolution];

    const frameCounts = buildFrameCounts(
      req.photos,
      req.bpm,
      req.beatsPerPhoto,
      req.firstBeatOffsetMs,
      req.fps
    );

    const outputPath = await save({
      filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
    });
    if (!outputPath) throw new Error("cancelled");

    const unlisten = await listen<RenderProgress>("render_progress", (e) =>
      onProgress(e.payload)
    );

    try {
      const resultPath = await invoke<string>("render_video", {
        config: {
          renderId: req.renderId,
          outputPath,
          photos: req.photos.map((p, i) => ({
            path: p.originalPath,
            frameCount: frameCounts[i],
          })),
          fps: req.fps,
          width,
          height,
          cropRatio: req.cropRatio,
          transition: req.transition,
          songPath: req.songRef?.ref ?? null,
          firstBeatOffsetMs: req.firstBeatOffsetMs,
          totalDurationS: req.totalDurationS,
        },
      });
      return { outputPath: resultPath, success: true };
    } finally {
      unlisten();
    }
  }

  async cancelRender(renderId: string): Promise<void> {
    await invoke("cancel_render", { renderId });
  }

  // ── Post-render reveal ────────────────────────────────────────────────────

  async revealOutput(result: RenderResult): Promise<void> {
    try {
      await revealItemInDir(result.outputPath);
    } catch {
      // revealItemInDir is best-effort; ignore failures silently
    }
  }

  // ── Asset URL ─────────────────────────────────────────────────────────────

  assetUrl(ref: string): string {
    return convertFileSrc(ref);
  }
}

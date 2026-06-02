import type {
  Photo,
  PhotoMeta,
  RenderProgress,
  Project,
} from "../../store/types";

/**
 * A file reference that works on both platforms.
 * - Desktop: { kind: "path"; path: string } — filesystem path from Tauri dialog
 * - Web: { kind: "file"; file: File; name: string } — browser File object
 */
export type PickedFile =
  | { kind: "path"; path: string }
  | { kind: "file"; file: File; name: string };

/**
 * Reference to a loaded song — used to load audio bytes platform-independently.
 * - Desktop: path string (filesystem path)
 * - Web: IDB key string (the File blob is stored in IndexedDB)
 */
export type SongRef = { ref: string; durationMs: number };

/**
 * A group of duplicate photos, either path-duplicates or content-duplicates.
 */
export interface DuplicateGroup {
  type: "path" | "content";
  photos: Photo[];
}

/**
 * Report of all detected duplicates in the current photo set.
 */
export interface DuplicateReport {
  groups: DuplicateGroup[];
  pathDuplicateCount: number;
  contentDuplicateCount: number;
}

/**
 * Configuration for a video render request.
 */
export interface RenderRequest {
  renderId: string;
  photos: Photo[];
  bpm: number;
  firstBeatOffsetMs: number;
  beatsPerPhoto: number;
  transition: "cut" | "crossfade" | "stack";
  cropRatio: string;
  scaleMode: "cover" | "contain";
  resolution: "720p" | "1080p" | "4k";
  fps: 24 | 30 | 60;
  songRef?: SongRef;
  totalDurationS: number;
}

/**
 * Result of a successful render.
 */
export interface RenderResult {
  outputPath: string; // desktop: file path; web: unused (download triggered inline)
  success: boolean;
}

/**
 * Platform abstraction interface.
 *
 * Encapsulates all platform-dependent operations (Tauri on desktop, browser APIs on web)
 * so that shared UI components can be platform-agnostic.
 *
 * Desktop implementations use @tauri-apps/api commands and file system operations.
 * Web implementations use IndexedDB for persistence, browser File APIs for I/O, and
 * browser APIs for rendering.
 */
export interface Platform {
  /**
   * Check that the platform backend is ready (e.g., FFmpeg compiled on desktop).
   * Desktop: invokes check_ffmpeg Tauri command.
   * Web: resolves immediately.
   */
  checkBackendReady(): Promise<void>;

  /**
   * Open a file picker dialog for image files.
   * Returns an array of picked file references (empty if cancelled).
   * Desktop: filters to *.jpg, *.jpeg, *.png, *.webp, *.heic, etc.
   * Web: uses <input type="file" accept="image/*" multiple>.
   */
  pickImageFiles(): Promise<PickedFile[]>;

  /**
   * Import image files: thumbnail generation, EXIF orientation, HEIC decode.
   * Given an array of picked files, returns PhotoMeta[] with originalPath, thumbPath,
   * width, height, and heicPaths filled in.
   * Desktop: invokes import_images Tauri command.
   * Web: processes files in browser (sharp/imagemagick substitute).
   */
  importImages(
    files: PickedFile[],
    onProgress?: (done: number, total: number) => void
  ): Promise<PhotoMeta[]>;

  /**
   * Analyze the current photo set for duplicates.
   * Hashes file content and detects both path-duplicates and content-duplicates.
   * Returns a DuplicateReport.
   * Desktop: invokes analyze_duplicates Tauri command.
   * Web: hashes from in-memory File objects and IndexedDB blobs.
   */
  analyzeDuplicates(photos: Photo[]): Promise<DuplicateReport>;

  /**
   * Open a file picker dialog for audio files.
   * Accepts .mp3, .wav, .aac, .m4a, .ogg, etc.
   * Returns a picked file reference, or null if cancelled.
   * Desktop: uses Tauri dialog.
   * Web: uses <input type="file" accept="audio/*">.
   */
  pickSongFile(): Promise<PickedFile | null>;

  /**
   * Load audio bytes for decoding (e.g., for BPM detection).
   * Desktop: uses convertFileSrc to fetch the file via Tauri resource.
   * Web: fetches the blob from IndexedDB and returns its ArrayBuffer.
   */
  loadAudio(ref: SongRef): Promise<ArrayBuffer>;

  /**
   * Subscribe to native file drop events (drag-and-drop).
   * Returns an unsubscribe function.
   * Callback receives array of PickedFiles dropped onto the window.
   * Desktop: subscribes to Tauri onDragDropEvent.
   * Web: attaches dragover/drop listeners to window.
   */
  onFileDrop(cb: (files: PickedFile[]) => void): () => void;

  /**
   * Save a project to persistent storage.
   * Desktop: saves to a .framecut JSON file via Tauri dialog and fs plugin.
   * Web: saves to IndexedDB.
   * Returns a path (desktop) or key (web) for reference.
   */
  saveProject(project: Project): Promise<string>;

  /**
   * Load a project from persistent storage.
   * Desktop: opens a file picker, validates schemaVersion, and loads the JSON.
   * Web: opens an IndexedDB browser or a file picker.
   * Returns the Project, or null if cancelled.
   */
  loadProject(): Promise<Project | null>;

  /**
   * Trigger a video render with the given configuration.
   * Desktop: invokes render_video Tauri command, which spawns FFmpeg subprocess(es).
   * Web: offloads to a Web Worker or ServerSent Events stream (TBD).
   * Emits progress via onProgress callback (chunkIndex, totalChunks, framesEncoded).
   * Returns a RenderResult on success.
   */
  renderVideo(
    req: RenderRequest,
    onProgress: (p: RenderProgress) => void
  ): Promise<RenderResult>;

  /**
   * Cancel an in-progress render by its render ID.
   * Desktop: kills the active FFmpeg subprocess(es) for this render.
   * Web: signals the render worker to abort.
   */
  cancelRender(renderId: string): Promise<void>;

  /**
   * Reveal the rendered output to the user.
   * Desktop: calls revealItemInDir on the output file (opens file manager).
   * Web: no-op (download is already triggered inline by the browser).
   */
  revealOutput(result: RenderResult): Promise<void>;

  /**
   * Convert a photo/thumbnail reference to a displayable URL.
   * Desktop: uses Tauri's convertFileSrc to produce asset:// URL.
   * Web: returns the ref as-is (already a blob: URL).
   */
  assetUrl(ref: string): string;
}

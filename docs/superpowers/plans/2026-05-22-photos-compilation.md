# PhotosCompilation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Tauri 2 desktop app that compiles 2000+ photos into a beat-synced MP4 video, with BPM detection, preview, crop/alignment controls, and drag-to-reorder filmstrip.

**Architecture:** Tauri 2.x shell with Rust backend (file I/O, FFmpeg subprocess, thumbnail generation) and React+Vite frontend (UI, Web Audio, Canvas preview, essentia.js BPM). Render pipeline is chunked (50 photos/chunk) with frame counts derived from cumulative timeline to prevent A/V drift.

**Tech Stack:** Tauri 2, Rust, React 18, TypeScript, Vite, Zustand, zundo, @dnd-kit/sortable, react-window, essentia.js, FFmpeg (BtbN GPL build), image crate, rayon, kamadak-exif, Vitest, @testing-library/react

---

## File Map

```
PhotosCompilation/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── capabilities/
│   │   └── default.json                  # Tauri 2 ACL permissions
│   ├── binaries/
│   │   └── ffmpeg-x86_64-pc-windows-msvc.exe   # bundled FFmpeg
│   └── src/
│       ├── main.rs                        # Tauri entry point
│       ├── lib.rs                         # command registration
│       ├── commands/
│       │   ├── import.rs                  # import_images command
│       │   ├── render.rs                  # render_video + cancel_render
│       │   └── disk.rs                    # check_disk_space
│       ├── ffmpeg/
│       │   ├── mod.rs
│       │   ├── startup_check.rs           # verify encoders/filters on launch
│       │   └── render_pipeline.rs         # build FFmpeg args, chunked render logic
│       └── image/
│           ├── mod.rs
│           ├── thumbnail.rs               # rayon parallel thumb generation
│           ├── exif.rs                    # kamadak-exif rotation detection
│           └── heic.rs                    # HEIC detection + FFmpeg convert
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── store/
│   │   ├── types.ts                       # Project, Photo, OutputConfig, etc.
│   │   └── projectStore.ts                # Zustand + zundo store
│   ├── lib/
│   │   ├── cumulativeTimeline.ts          # buildCumulativeTimeline, buildFrameCounts, binarySearchLE
│   │   ├── bpmDetector.ts                 # essentia.js IBpmDetector wrapper
│   │   └── tapTempo.ts                    # tap-tempo median calculation
│   ├── hooks/
│   │   ├── useAudioEngine.ts              # AudioContext load/play/pause/seek
│   │   └── usePreviewSync.ts              # rAF loop + cumulative timeline sync
│   ├── components/
│   │   ├── Filmstrip/
│   │   │   ├── Filmstrip.tsx              # @dnd-kit/sortable horizontal strip
│   │   │   └── FilmstripCell.tsx          # thumb + beat badge + playhead
│   │   ├── PhotoGrid/
│   │   │   ├── PhotoGrid.tsx              # import modal with react-window grid
│   │   │   └── PhotoGridCell.tsx          # individual thumb cell
│   │   ├── PreviewCanvas/
│   │   │   └── PreviewCanvas.tsx          # Canvas element, driven by usePreviewSync
│   │   ├── BpmControls/
│   │   │   └── BpmControls.tsx            # manual input, tap-tempo, offset slider
│   │   ├── ControlsPanel/
│   │   │   └── ControlsPanel.tsx          # crop, alignment, beats/photo, transition
│   │   └── ExportPanel/
│   │       └── ExportPanel.tsx            # format, resolution, fps, render, progress, cancel
│   └── utils/
│       └── tauriAsset.ts                  # convertFileSrc wrapper
├── src/test/
│   ├── cumulativeTimeline.test.ts
│   ├── tapTempo.test.ts
│   └── bpmDetector.test.ts
├── vite.config.ts
└── docs/
    └── superpowers/
        ├── specs/2026-05-22-photos-compilation-design.md
        └── plans/2026-05-22-photos-compilation.md
```

---

## Task 1: Tauri 2 + React scaffold

**Files:**
- Create: entire project scaffold via `create-tauri-app`
- Modify: `vite.config.ts`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`

- [ ] **Step 1: Scaffold project**

```bash
cd "D:/my_stuff/developer/Developer/Developer/PhotosCompilation"
npm create tauri-app@2 . -- --template react-ts --manager npm
```

Expected: project files generated. Say "yes" to overwrite if prompted.

- [ ] **Step 2: Install frontend deps**

```bash
npm install zustand zundo @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities react-window @types/react-window
npm install -D vitest @testing-library/react @testing-library/user-event jsdom @vitest/coverage-v8
```

- [ ] **Step 3: Configure Vite with Vitest**

Replace `vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: { target: ["es2021", "chrome100", "safari13"], minify: !process.env.TAURI_ENV_DEBUG },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
  },
});
```

- [ ] **Step 4: Configure Tauri capabilities (ACL)**

Create `src-tauri/capabilities/default.json`:
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "PhotosCompilation default capabilities",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:allow-open",
    "dialog:allow-save",
    "fs:allow-read-text-file",
    "fs:allow-write-text-file",
    { "identifier": "fs:scope", "allow": [{ "path": "**" }] },
    "shell:allow-open"
  ]
}
```

Note: FFmpeg runs via `std::process::Command` directly from Rust — no `shell:allow-execute` needed. `fs:scope **` allows read/write of user-selected paths (from file dialogs).

- [ ] **Step 5: Update tauri.conf.json app name and window**

In `src-tauri/tauri.conf.json`, set:
```json
{
  "productName": "PhotosCompilation",
  "version": "0.1.0",
  "app": {
    "windows": [{
      "title": "PhotosCompilation",
      "width": 1280,
      "height": 800,
      "minWidth": 900,
      "minHeight": 600
    }],
    "security": {
      "assetProtocol": { "enable": true, "scope": { "allow": ["**"] } }
    }
  }
}
```

- [ ] **Step 6: Verify scaffold runs**

```bash
npm run tauri dev
```

Expected: window opens with default Vite+React page. Close it.

- [ ] **Step 7: Commit**

```bash
git init
git add .
git commit -m "feat: scaffold Tauri 2 + React + Vite project"
```

---

## Task 2: Types + Project store

**Files:**
- Create: `src/store/types.ts`
- Create: `src/store/projectStore.ts`

- [ ] **Step 1: Write types**

Create `src/store/types.ts`:
```ts
export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:3";
export type Alignment = "center" | "top" | "bottom" | "left" | "right";
export type Transition = "cut" | "crossfade";
export type Resolution = "720p" | "1080p" | "4k";
export type Fps = 24 | 30 | 60;

export interface Photo {
  id: string;
  originalPath: string;
  thumbPath: string;
  beatsOverride?: number; // undefined = use project.beatsPerPhoto
}

export interface AudioFile {
  path: string;
  durationMs: number;
}

export interface OutputConfig {
  format: "mp4";
  resolution: Resolution;
  fps: Fps;
}

export interface Project {
  schemaVersion: 1;
  id: string;
  name: string;
  photos: Photo[];
  bpm: number;
  firstBeatOffsetMs: number;
  beatsPerPhoto: number; // float allowed, e.g. 0.5
  cropRatio: AspectRatio;
  alignment: Alignment;
  globalTransition: Transition;
  song?: AudioFile;
  outputConfig: OutputConfig;
  lastModified: number;
}

export interface RenderProgress {
  chunkIndex: number;
  totalChunks: number;
  framesEncoded: number;
}

export interface PhotoMeta {
  originalPath: string;
  thumbPath: string;
  width: number;
  height: number;
  heicPaths: string[]; // non-empty if any imported files are HEIC
}
```

- [ ] **Step 2: Write project store**

Create `src/store/projectStore.ts`:
```ts
import { create } from "zustand";
import { temporal } from "zundo";
import { nanoid } from "nanoid";
import type { Project, Photo, AudioFile, OutputConfig, AspectRatio, Alignment, Transition } from "./types";

function defaultProject(): Project {
  return {
    schemaVersion: 1,
    id: nanoid(),
    name: "Untitled Project",
    photos: [],
    bpm: 120,
    firstBeatOffsetMs: 0,
    beatsPerPhoto: 1,
    cropRatio: "16:9",
    alignment: "center",
    globalTransition: "cut",
    outputConfig: { format: "mp4", resolution: "1080p", fps: 30 },
    lastModified: Date.now(),
  };
}

interface ProjectState {
  project: Project;
  setPhotos: (photos: Photo[]) => void;
  addPhotos: (photos: Photo[]) => void;
  reorderPhotos: (fromIndex: number, toIndex: number) => void;
  removePhoto: (id: string) => void;
  setPhotoBeatsOverride: (id: string, beats: number | undefined) => void;
  setBpm: (bpm: number) => void;
  setFirstBeatOffsetMs: (ms: number) => void;
  setBeatsPerPhoto: (n: number) => void;
  setCropRatio: (ratio: AspectRatio) => void;
  setAlignment: (alignment: Alignment) => void;
  setGlobalTransition: (t: Transition) => void;
  setSong: (song: AudioFile | undefined) => void;
  setOutputConfig: (config: OutputConfig) => void;
  setName: (name: string) => void;
  loadProject: (project: Project) => void;
}

function touch(project: Project): Project {
  return { ...project, lastModified: Date.now() };
}

export const useProjectStore = create<ProjectState>()(
  temporal(
    (set) => ({
      project: defaultProject(),

      setPhotos: (photos) => set((s) => ({ project: touch({ ...s.project, photos }) })),
      addPhotos: (photos) =>
        set((s) => ({ project: touch({ ...s.project, photos: [...s.project.photos, ...photos] }) })),
      reorderPhotos: (fromIndex, toIndex) =>
        set((s) => {
          const photos = [...s.project.photos];
          const [moved] = photos.splice(fromIndex, 1);
          photos.splice(toIndex, 0, moved);
          return { project: touch({ ...s.project, photos }) };
        }),
      removePhoto: (id) =>
        set((s) => ({ project: touch({ ...s.project, photos: s.project.photos.filter((p) => p.id !== id) }) })),
      setPhotoBeatsOverride: (id, beats) =>
        set((s) => ({
          project: touch({
            ...s.project,
            photos: s.project.photos.map((p) => (p.id === id ? { ...p, beatsOverride: beats } : p)),
          }),
        })),
      setBpm: (bpm) => set((s) => ({ project: touch({ ...s.project, bpm }) })),
      setFirstBeatOffsetMs: (firstBeatOffsetMs) =>
        set((s) => ({ project: touch({ ...s.project, firstBeatOffsetMs }) })),
      setBeatsPerPhoto: (beatsPerPhoto) =>
        set((s) => ({ project: touch({ ...s.project, beatsPerPhoto }) })),
      setCropRatio: (cropRatio) => set((s) => ({ project: touch({ ...s.project, cropRatio }) })),
      setAlignment: (alignment) => set((s) => ({ project: touch({ ...s.project, alignment }) })),
      setGlobalTransition: (globalTransition) =>
        set((s) => ({ project: touch({ ...s.project, globalTransition }) })),
      setSong: (song) => set((s) => ({ project: touch({ ...s.project, song }) })),
      setOutputConfig: (outputConfig) =>
        set((s) => ({ project: touch({ ...s.project, outputConfig }) })),
      setName: (name) => set((s) => ({ project: touch({ ...s.project, name }) })),
      loadProject: (project) => set({ project }),
    }),
    {
      // Only track undo for meaningful actions, not transient slider state
      partialize: (state) => ({ project: state.project }),
      equality: (a, b) => {
        // Don't create undo entry if only lastModified changed
        const ap = { ...a.project, lastModified: 0 };
        const bp = { ...b.project, lastModified: 0 };
        return JSON.stringify(ap) === JSON.stringify(bp);
      },
    }
  )
);

export const useTemporalStore = <T>(selector: (state: ReturnType<typeof useProjectStore.temporal.getState>) => T) =>
  useProjectStore.temporal(selector);
```

- [ ] **Step 3: Install nanoid**

```bash
npm install nanoid
```

- [ ] **Step 4: Commit**

```bash
git add src/store/
git commit -m "feat: add Project types and Zustand+zundo store"
```

---

## Task 3: Cumulative timeline math (pure functions, fully tested)

**Files:**
- Create: `src/lib/cumulativeTimeline.ts`
- Create: `src/lib/tapTempo.ts`
- Create: `src/test/cumulativeTimeline.test.ts`
- Create: `src/test/tapTempo.test.ts`

- [ ] **Step 1: Write failing tests for cumulative timeline**

Create `src/test/cumulativeTimeline.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildCumulativeTimeline, buildFrameCounts, binarySearchLE } from "../lib/cumulativeTimeline";
import type { Photo } from "../store/types";

function makePhoto(id: string, beatsOverride?: number): Photo {
  return { id, originalPath: "", thumbPath: "", beatsOverride };
}

describe("buildCumulativeTimeline", () => {
  it("returns start time for each photo at 120bpm, 1 beat each", () => {
    const photos = [makePhoto("a"), makePhoto("b"), makePhoto("c")];
    const times = buildCumulativeTimeline(photos, 120, 1, 0);
    expect(times[0]).toBeCloseTo(0);
    expect(times[1]).toBeCloseTo(0.5);
    expect(times[2]).toBeCloseTo(1.0);
  });

  it("respects firstBeatOffsetMs", () => {
    const photos = [makePhoto("a"), makePhoto("b")];
    const times = buildCumulativeTimeline(photos, 120, 1, 500);
    expect(times[0]).toBeCloseTo(0.5);
    expect(times[1]).toBeCloseTo(1.0);
  });

  it("respects per-photo beatsOverride", () => {
    const photos = [makePhoto("a", 2), makePhoto("b", 1)];
    const times = buildCumulativeTimeline(photos, 120, 1, 0);
    expect(times[0]).toBeCloseTo(0);
    expect(times[1]).toBeCloseTo(1.0); // 2 beats at 120bpm = 1s
  });

  it("supports fractional beatsPerPhoto (0.5)", () => {
    const photos = [makePhoto("a"), makePhoto("b"), makePhoto("c")];
    const times = buildCumulativeTimeline(photos, 120, 0.5, 0);
    expect(times[0]).toBeCloseTo(0);
    expect(times[1]).toBeCloseTo(0.25);
    expect(times[2]).toBeCloseTo(0.5);
  });
});

describe("buildFrameCounts", () => {
  it("integer frame counts sum to total expected frames — no rounding drift", () => {
    const n = 2000;
    const photos = Array.from({ length: n }, (_, i) => makePhoto(String(i)));
    const fps = 30;
    const bpm = 127; // deliberately awkward — 60/127 ≈ 0.4724s, not integer frames
    const counts = buildFrameCounts(photos, bpm, 1, 0, fps);
    const totalFrames = counts.reduce((a, b) => a + b, 0);
    const expectedFrames = Math.round((n * (60 / bpm)) * fps);
    // allow ±1 frame total drift across 2000 photos
    expect(Math.abs(totalFrames - expectedFrames)).toBeLessThanOrEqual(1);
  });

  it("each frame count is a positive integer", () => {
    const photos = [makePhoto("a"), makePhoto("b"), makePhoto("c")];
    const counts = buildFrameCounts(photos, 120, 1, 0, 30);
    counts.forEach((c) => {
      expect(Number.isInteger(c)).toBe(true);
      expect(c).toBeGreaterThan(0);
    });
  });
});

describe("binarySearchLE", () => {
  it("returns index of largest value <= target", () => {
    const times = [0, 0.5, 1.0, 1.5, 2.0];
    expect(binarySearchLE(times, 0.0)).toBe(0);
    expect(binarySearchLE(times, 0.4)).toBe(0);
    expect(binarySearchLE(times, 0.5)).toBe(1);
    expect(binarySearchLE(times, 1.3)).toBe(2);
    expect(binarySearchLE(times, 2.1)).toBe(4);
  });

  it("returns 0 for time before first beat", () => {
    const times = [0.5, 1.0];
    expect(binarySearchLE(times, 0.1)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run src/test/cumulativeTimeline.test.ts
```

Expected: fail with "Cannot find module '../lib/cumulativeTimeline'"

- [ ] **Step 3: Implement cumulativeTimeline.ts**

Create `src/lib/cumulativeTimeline.ts`:
```ts
import type { Photo } from "../store/types";

export function buildCumulativeTimeline(
  photos: Photo[],
  bpm: number,
  beatsPerPhoto: number,
  firstBeatOffsetMs: number
): number[] {
  const beatDuration = 60 / bpm;
  const times: number[] = [];
  let t = firstBeatOffsetMs / 1000;
  for (const photo of photos) {
    times.push(t);
    t += beatDuration * (photo.beatsOverride ?? beatsPerPhoto);
  }
  return times;
}

export function buildFrameCounts(
  photos: Photo[],
  bpm: number,
  beatsPerPhoto: number,
  firstBeatOffsetMs: number,
  fps: number
): number[] {
  const times = buildCumulativeTimeline(photos, bpm, beatsPerPhoto, firstBeatOffsetMs);
  const beatDuration = 60 / bpm;
  return photos.map((photo, i) => {
    const startFrame = Math.round(times[i] * fps);
    const endSec =
      i + 1 < photos.length
        ? times[i + 1]
        : times[i] + beatDuration * (photo.beatsOverride ?? beatsPerPhoto);
    const endFrame = Math.round(endSec * fps);
    return Math.max(1, endFrame - startFrame);
  });
}

/** Returns index of largest value in sorted `times` that is <= `target`. */
export function binarySearchLE(times: number[], target: number): number {
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (times[mid] <= target) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/test/cumulativeTimeline.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Write tap-tempo tests**

Create `src/test/tapTempo.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { tapTempoMedian } from "../lib/tapTempo";

describe("tapTempoMedian", () => {
  it("returns null for < 2 taps", () => {
    expect(tapTempoMedian([1000])).toBeNull();
  });

  it("returns BPM from 2 taps at 500ms interval", () => {
    const bpm = tapTempoMedian([0, 500]);
    expect(bpm).toBeCloseTo(120, 0);
  });

  it("uses median of last 8 intervals", () => {
    // 9 taps: first interval is outlier 2000ms, rest are 500ms
    const taps = [0, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500];
    const bpm = tapTempoMedian(taps);
    expect(bpm).toBeCloseTo(120, 0); // median of 500ms intervals
  });
});
```

- [ ] **Step 6: Run tap-tempo tests — expect FAIL**

```bash
npx vitest run src/test/tapTempo.test.ts
```

Expected: fail with "Cannot find module"

- [ ] **Step 7: Implement tapTempo.ts**

Create `src/lib/tapTempo.ts`:
```ts
/** Returns BPM from tap timestamps (ms), using median of last 8 intervals. */
export function tapTempoMedian(timestamps: number[]): number | null {
  if (timestamps.length < 2) return null;
  const recent = timestamps.slice(-9); // up to 9 taps = 8 intervals
  const intervals: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    intervals.push(recent[i] - recent[i - 1]);
  }
  intervals.sort((a, b) => a - b);
  const mid = Math.floor(intervals.length / 2);
  const median =
    intervals.length % 2 === 0
      ? (intervals[mid - 1] + intervals[mid]) / 2
      : intervals[mid];
  return 60000 / median;
}
```

- [ ] **Step 8: Run all tests — expect PASS**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/ src/test/
git commit -m "feat: cumulative timeline math + tap-tempo with tests"
```

---

## Task 4: Rust project setup + Cargo deps

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add Rust dependencies**

In `src-tauri/Cargo.toml`, under `[dependencies]`:
```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rayon = "1"
image = { version = "0.25", features = ["jpeg", "png", "webp"] }
exif = { package = "kamadak-exif", version = "0.6" }
nanoid = "0.4"
anyhow = "1"
tempfile = "3"
walkdir = "2"
dunce = "1"
```

- [ ] **Step 2: Create lib.rs with command registration**

Create `src-tauri/src/lib.rs`:
```rust
mod commands;
mod ffmpeg;
mod image;

pub use commands::import::import_images;
pub use commands::render::{render_video, cancel_render};
pub use commands::disk::check_disk_space;
pub use ffmpeg::startup_check::check_ffmpeg;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            import_images,
            render_video,
            cancel_render,
            check_disk_space,
            check_ffmpeg,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Update main.rs**

Replace `src-tauri/src/main.rs`:
```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    photos_compilation_lib::run();
}
```

- [ ] **Step 4: Update build.rs to export TARGET triple**

Replace `src-tauri/build.rs`:
```rust
fn main() {
    // Expose TARGET triple so we can resolve the sidecar binary name at runtime
    println!(
        "cargo:rustc-env=TARGET={}",
        std::env::var("TARGET").unwrap_or_default()
    );
    tauri_build::build();
}
```

- [ ] **Step 5: Create module stubs so it compiles**

Create `src-tauri/src/commands/mod.rs`:
```rust
pub mod import;
pub mod render;
pub mod disk;
```

Create `src-tauri/src/commands/import.rs`:
```rust
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoMeta {
    pub original_path: String,
    pub thumb_path: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub photos: Vec<PhotoMeta>,
    pub heic_paths: Vec<String>,
}

#[tauri::command]
pub async fn import_images(paths: Vec<String>, thumb_size: u32) -> Result<ImportResult, String> {
    // stub
    Ok(ImportResult { photos: vec![], heic_paths: vec![] })
}
```

Create `src-tauri/src/commands/render.rs`:
```rust
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct RenderConfig {
    pub output_path: String,
    pub photos: Vec<PhotoRenderItem>,
    pub fps: u32,
    pub width: u32,
    pub height: u32,
    pub transition: String,
    pub song_path: Option<String>,
    pub first_beat_offset_ms: f64,
    pub total_duration_s: f64,
}

#[derive(Deserialize)]
pub struct PhotoRenderItem {
    pub path: String,
    pub frame_count: u32,
}

#[tauri::command]
pub async fn render_video(_config: RenderConfig, _window: tauri::Window) -> Result<String, String> {
    Ok(String::new())
}

#[tauri::command]
pub async fn cancel_render(_render_id: String) -> Result<(), String> {
    Ok(())
}
```

Create `src-tauri/src/commands/disk.rs`:
```rust
#[tauri::command]
pub fn check_disk_space(path: String, required_bytes: u64) -> Result<bool, String> {
    Ok(true)
}
```

Create `src-tauri/src/ffmpeg/mod.rs`:
```rust
pub mod startup_check;
pub mod render_pipeline;

use std::path::PathBuf;
use tauri::Manager;

/// Resolve the bundled FFmpeg sidecar binary path.
/// Tauri places sidecar binaries as `binaries/ffmpeg-{TARGET_TRIPLE}[.exe]`.
pub fn ffmpeg_binary(app: &tauri::AppHandle) -> anyhow::Result<PathBuf> {
    let target = env!("TARGET"); // set by build.rs
    let name = format!("binaries/ffmpeg-{target}");
    let path = app
        .path()
        .resolve(&name, tauri::path::BaseDirectory::Resource)?;
    Ok(path)
}
```

Create `src-tauri/src/ffmpeg/startup_check.rs`:
```rust
#[tauri::command]
pub fn check_ffmpeg() -> Result<(), String> {
    Ok(())
}
```

Create `src-tauri/src/ffmpeg/render_pipeline.rs`:
```rust
// FFmpeg command builder — implemented in Task 9
```

Create `src-tauri/src/image/mod.rs`:
```rust
pub mod thumbnail;
pub mod exif;
pub mod heic;
```

Create `src-tauri/src/image/thumbnail.rs`, `exif.rs`, `heic.rs` as empty stubs:
```rust
// implemented in Task 5
```

- [ ] **Step 6: Verify it compiles**

```bash
npm run tauri build -- --debug
```

Expected: compiles without errors.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/
git commit -m "feat: Rust project structure + module stubs"
```

---

## Task 5: Bundle FFmpeg + startup check

**Files:**
- Add: `src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe`
- Modify: `src-tauri/tauri.conf.json`
- Implement: `src-tauri/src/ffmpeg/startup_check.rs`

- [ ] **Step 1: Download BtbN GPL FFmpeg for Windows**

Download `ffmpeg-master-latest-win64-gpl.zip` from https://github.com/BtbN/FFmpeg-Builds/releases

Extract and copy `ffmpeg.exe` to:
```
src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe
```

The filename suffix (`-x86_64-pc-windows-msvc`) matches Tauri's sidecar target triple convention.

- [ ] **Step 2: Register sidecar in tauri.conf.json**

In `src-tauri/tauri.conf.json`, add under `"bundle"`:
```json
"externalBin": ["binaries/ffmpeg"]
```

- [ ] **Step 3: Implement startup check**

Replace `src-tauri/src/ffmpeg/startup_check.rs`:
```rust
use std::process::Command;

#[tauri::command]
pub fn check_ffmpeg(app: tauri::AppHandle) -> Result<(), String> {
    let ffmpeg = crate::ffmpeg::ffmpeg_binary(&app).map_err(|e| e.to_string())?;

    // Check encoders
    let encoders = Command::new(&ffmpeg)
        .args(["-encoders", "-v", "quiet"])
        .output()
        .map_err(|e| format!("Failed to run ffmpeg: {e}"))?;
    let encoder_output = String::from_utf8_lossy(&encoders.stdout);
    if !encoder_output.contains("libx264") {
        return Err("FFmpeg missing libx264 encoder. Ensure you downloaded the GPL build from BtbN.".into());
    }

    // Check filters
    let filters = Command::new(&ffmpeg)
        .args(["-filters", "-v", "quiet"])
        .output()
        .map_err(|e| format!("Failed to run ffmpeg filters check: {e}"))?;
    let filter_output = String::from_utf8_lossy(&filters.stdout);
    for required in &["xfade", "concat", "scale", "crop"] {
        if !filter_output.contains(required) {
            return Err(format!("FFmpeg missing required filter: {required}"));
        }
    }

    Ok(())
}
```

- [ ] **Step 4: Call check_ffmpeg on app start in App.tsx**

In `src/App.tsx`:
```tsx
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export default function App() {
  const [ffmpegError, setFfmpegError] = useState<string | null>(null);

  useEffect(() => {
    invoke<void>("check_ffmpeg").catch((e: string) => setFfmpegError(e));
  }, []);

  if (ffmpegError) {
    return (
      <div style={{ padding: 32, color: "red" }}>
        <h2>FFmpeg Error</h2>
        <p>{ffmpegError}</p>
        <p>Download the GPL build from: https://github.com/BtbN/FFmpeg-Builds/releases</p>
      </div>
    );
  }

  return <div>PhotosCompilation — loading</div>;
}
```

- [ ] **Step 5: Test startup check**

```bash
npm run tauri dev
```

Expected: app opens without error. Open DevTools console — no invoke errors.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/binaries/ src-tauri/tauri.conf.json src-tauri/src/ffmpeg/startup_check.rs src/App.tsx
git commit -m "feat: bundle FFmpeg + startup encoder/filter check"
```

---

## Task 6: Thumbnail generation (Rust, EXIF-corrected)

**Files:**
- Implement: `src-tauri/src/image/thumbnail.rs`
- Implement: `src-tauri/src/image/exif.rs`
- Implement: `src-tauri/src/commands/import.rs`

- [ ] **Step 1: Implement EXIF rotation reader**

Replace `src-tauri/src/image/exif.rs`:
```rust
use std::fs::File;
use std::path::Path;

/// Returns the EXIF orientation value (1–8), or 1 if not present.
pub fn read_orientation(path: &Path) -> u32 {
    let file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return 1,
    };
    let mut bufreader = std::io::BufReader::new(&file);
    let exifreader = exif::Reader::new();
    let exif = match exifreader.read_from_container(&mut bufreader) {
        Ok(e) => e,
        Err(_) => return 1,
    };
    if let Some(field) = exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY) {
        if let exif::Value::Short(ref v) = field.value {
            if let Some(&o) = v.first() {
                return o as u32;
            }
        }
    }
    1
}

/// Apply EXIF orientation to a DynamicImage.
pub fn apply_orientation(img: image::DynamicImage, orientation: u32) -> image::DynamicImage {
    match orientation {
        2 => img.fliph(),
        3 => img.rotate180(),
        4 => img.flipv(),
        5 => img.rotate90().fliph(),
        6 => img.rotate90(),
        7 => img.rotate270().fliph(),
        8 => img.rotate270(),
        _ => img,
    }
}
```

`exif = { package = "kamadak-exif", version = "0.6" }` was already added in Task 4's Cargo.toml. No additional entry needed.

- [ ] **Step 2: Implement thumbnail generator**

Replace `src-tauri/src/image/thumbnail.rs`:
```rust
use std::path::{Path, PathBuf};
use rayon::prelude::*;
use image::GenericImageView;
use crate::image::exif::{read_orientation, apply_orientation};

pub struct ThumbResult {
    pub original_path: String,
    pub thumb_path: String,
    pub width: u32,
    pub height: u32,
}

/// Generate thumbnails for all paths in parallel. Saves to thumb_dir.
pub fn generate_thumbnails(paths: &[PathBuf], thumb_size: u32, thumb_dir: &Path) -> Vec<ThumbResult> {
    paths.par_iter().filter_map(|path| {
        generate_one(path, thumb_size, thumb_dir).ok()
    }).collect()
}

fn generate_one(path: &Path, thumb_size: u32, thumb_dir: &Path) -> anyhow::Result<ThumbResult> {
    let canonical = dunce::canonicalize(path)?;

    let orientation = read_orientation(&canonical);
    let img = image::open(&canonical)?;
    let img = apply_orientation(img, orientation);

    let (w, h) = img.dimensions();
    let thumb = img.thumbnail(thumb_size, thumb_size);

    let stem = canonical
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy();
    let hash = format!("{:x}", md5_of_path(&canonical));
    let thumb_filename = format!("{stem}_{hash}.jpg");
    let thumb_path = thumb_dir.join(&thumb_filename);

    thumb.save_with_format(&thumb_path, image::ImageFormat::Jpeg)?;

    Ok(ThumbResult {
        original_path: canonical.to_string_lossy().into_owned(),
        thumb_path: thumb_path.to_string_lossy().into_owned(),
        width: w,
        height: h,
    })
}

fn md5_of_path(path: &Path) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    path.hash(&mut h);
    h.finish()
}
```

- [ ] **Step 3: Implement import_images command**

Replace `src-tauri/src/commands/import.rs`:
```rust
use std::path::{Path, PathBuf};
use serde::Serialize;
use tauri::Manager;
use crate::image::thumbnail::generate_thumbnails;
use crate::image::heic::detect_heic;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoMeta {
    pub original_path: String,
    pub thumb_path: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub photos: Vec<PhotoMeta>,
    pub heic_paths: Vec<String>,
}

#[tauri::command]
pub async fn import_images(
    app: tauri::AppHandle,
    paths: Vec<String>,
    thumb_size: u32,
) -> Result<ImportResult, String> {
    let thumb_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("thumbnails");
    std::fs::create_dir_all(&thumb_dir).map_err(|e| e.to_string())?;

    let path_bufs: Vec<PathBuf> = paths.iter().map(PathBuf::from).collect();

    // Detect HEIC before processing
    let heic_paths: Vec<String> = path_bufs.iter()
        .filter(|p| detect_heic(p))
        .map(|p| p.to_string_lossy().into_owned())
        .collect();

    // Only process non-HEIC files
    let processable: Vec<PathBuf> = path_bufs.into_iter()
        .filter(|p| !detect_heic(p))
        .collect();

    let results = generate_thumbnails(&processable, thumb_size, &thumb_dir);

    let photos = results.into_iter().map(|r| PhotoMeta {
        original_path: r.original_path,
        thumb_path: r.thumb_path,
        width: r.width,
        height: r.height,
    }).collect();

    Ok(ImportResult { photos, heic_paths })
}
```

- [ ] **Step 4: Implement HEIC detection + conversion**

Replace `src-tauri/src/image/heic.rs`:
```rust
use std::path::{Path, PathBuf};

pub fn detect_heic(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).as_deref(),
        Some("heic") | Some("heif")
    )
}

/// Convert HEIC files to JPEG using bundled FFmpeg. Returns new JPEG paths.
pub fn convert_heic_files(
    heic_paths: &[PathBuf],
    output_dir: &Path,
    ffmpeg_path: &Path,
) -> Vec<(String, String)> {
    heic_paths.iter().filter_map(|p| {
        let stem = p.file_stem()?.to_string_lossy().into_owned();
        let out = output_dir.join(format!("{stem}.jpg"));
        let status = std::process::Command::new(ffmpeg_path)
            .args(["-y", "-i"])
            .arg(p)
            .arg(&out)
            .status()
            .ok()?;
        if status.success() {
            Some((p.to_string_lossy().into_owned(), out.to_string_lossy().into_owned()))
        } else {
            None
        }
    }).collect()
}
```

Add a `convert_heic` Tauri command in `src/commands/import.rs` after `import_images`:
```rust
#[tauri::command]
pub async fn convert_heic(
    app: tauri::AppHandle,
    heic_paths: Vec<String>,
) -> Result<Vec<String>, String> {
    let thumb_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("thumbnails");
    std::fs::create_dir_all(&thumb_dir).map_err(|e| e.to_string())?;

    let ffmpeg = app
        .path()
        .resolve("binaries/ffmpeg", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;

    let paths: Vec<std::path::PathBuf> = heic_paths.iter().map(std::path::PathBuf::from).collect();
    let converted = crate::image::heic::convert_heic_files(&paths, &thumb_dir, &ffmpeg);
    Ok(converted.into_iter().map(|(_, new)| new).collect())
}
```

Register `convert_heic` in `lib.rs` invoke handler.

- [ ] **Step 5: Build and verify**

```bash
cargo build --manifest-path src-tauri/Cargo.toml
```

Expected: compiles without errors.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/image/ src-tauri/src/commands/import.rs src-tauri/Cargo.toml
git commit -m "feat: thumbnail generation with EXIF rotation + HEIC detection/conversion"
```

---

## Task 7: PhotoGrid import modal (React)

**Files:**
- Create: `src/utils/tauriAsset.ts`
- Create: `src/components/PhotoGrid/PhotoGridCell.tsx`
- Create: `src/components/PhotoGrid/PhotoGrid.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create tauriAsset utility**

Create `src/utils/tauriAsset.ts`:
```ts
import { convertFileSrc } from "@tauri-apps/api/core";

/** Convert a local filesystem path to a tauri asset:// URL for use in <img> src */
export function assetUrl(filePath: string): string {
  return convertFileSrc(filePath);
}
```

- [ ] **Step 2: Create PhotoGridCell**

Create `src/components/PhotoGrid/PhotoGridCell.tsx`:
```tsx
import { assetUrl } from "../../utils/tauriAsset";

interface Props {
  thumbPath: string;
  selected: boolean;
  onToggle: () => void;
}

export function PhotoGridCell({ thumbPath, selected, onToggle }: Props) {
  return (
    <div
      onClick={onToggle}
      style={{
        position: "relative",
        cursor: "pointer",
        border: selected ? "2px solid #5b6eff" : "2px solid transparent",
        borderRadius: 4,
        overflow: "hidden",
        aspectRatio: "1",
        background: "#222",
      }}
    >
      <img
        src={assetUrl(thumbPath)}
        alt=""
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
      {selected && (
        <div
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            background: "#5b6eff",
            color: "#fff",
            borderRadius: "50%",
            width: 18,
            height: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
          }}
        >
          ✓
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create PhotoGrid modal**

Create `src/components/PhotoGrid/PhotoGrid.tsx`:
```tsx
import { useState, useCallback } from "react";
import { FixedSizeGrid } from "react-window";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { nanoid } from "nanoid";
import { PhotoGridCell } from "./PhotoGridCell";
import { useProjectStore } from "../../store/projectStore";
import type { PhotoMeta } from "../../store/types";

interface Props {
  onClose: () => void;
}

const CELL_SIZE = 120;
const COLUMNS = 4;

export function PhotoGrid({ onClose }: Props) {
  const addPhotos = useProjectStore((s) => s.addPhotos);
  const [photos, setPhotos] = useState<PhotoMeta[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [heicPending, setHeicPending] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    const result = await open({ multiple: true, filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "heic", "heif"] }] });
    if (!result) return;
    const paths = Array.isArray(result) ? result : [result];
    setLoading(true);
    const importResult = await invoke<{ photos: PhotoMeta[]; heicPaths: string[] }>("import_images", { paths, thumbSize: 240 });
    setLoading(false);
    if (importResult.heicPaths.length > 0) {
      setHeicPending(importResult.heicPaths);
    }
    setPhotos(importResult.photos);
    setSelected(new Set(importResult.photos.map((_, i) => i)));
  };

  const handleConvertHeic = async () => {
    setLoading(true);
    const converted = await invoke<string[]>("convert_heic", { heicPaths: heicPending });
    setHeicPending([]);
    const importResult = await invoke<{ photos: PhotoMeta[]; heicPaths: string[] }>("import_images", { paths: converted, thumbSize: 240 });
    setLoading(false);
    setPhotos((prev) => [...prev, ...importResult.photos]);
    setSelected((prev) => {
      const next = new Set(prev);
      const base = photos.length;
      importResult.photos.forEach((_, i) => next.add(base + i));
      return next;
    });
  };

  const toggleSelect = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const handleConfirm = () => {
    const chosen = photos
      .filter((_, i) => selected.has(i))
      .map((p) => ({
        id: nanoid(),
        originalPath: p.originalPath,
        thumbPath: p.thumbPath,
      }));
    addPhotos(chosen);
    onClose();
  };

  const rows = Math.ceil(photos.length / COLUMNS);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#1a1a2e", borderRadius: 8, padding: 24, width: 560, maxHeight: "80vh", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, color: "#fff" }}>Import Photos</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#888", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        {heicPending.length > 0 && (
          <div style={{ background: "#2a1a0e", border: "1px solid #a06030", borderRadius: 4, padding: 12, color: "#f0a060" }}>
            {heicPending.length} photos are HEIC format. Convert to JPEG for compatibility?
            <button onClick={handleConvertHeic} style={{ marginLeft: 12, padding: "4px 12px", background: "#a06030", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>
              Convert
            </button>
          </div>
        )}

        <button onClick={handleImport} disabled={loading} style={{ padding: "8px 16px", background: "#5b6eff", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>
          {loading ? "Loading…" : "Choose Photos / Folder"}
        </button>

        {photos.length > 0 && (
          <FixedSizeGrid
            columnCount={COLUMNS}
            columnWidth={CELL_SIZE}
            rowCount={rows}
            rowHeight={CELL_SIZE}
            width={COLUMNS * CELL_SIZE}
            height={400}
          >
            {({ columnIndex, rowIndex, style }) => {
              const i = rowIndex * COLUMNS + columnIndex;
              if (i >= photos.length) return null;
              return (
                <div style={style}>
                  <PhotoGridCell
                    thumbPath={photos[i].thumbPath}
                    selected={selected.has(i)}
                    onToggle={() => toggleSelect(i)}
                  />
                </div>
              );
            }}
          </FixedSizeGrid>
        )}

        <button
          onClick={handleConfirm}
          disabled={selected.size === 0}
          style={{ padding: "8px 16px", background: selected.size > 0 ? "#5b6eff" : "#444", color: "#fff", border: "none", borderRadius: 4, cursor: selected.size > 0 ? "pointer" : "default" }}
        >
          Add {selected.size} photos to filmstrip
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire into App.tsx**

Replace `src/App.tsx`:
```tsx
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PhotoGrid } from "./components/PhotoGrid/PhotoGrid";

export default function App() {
  const [ffmpegError, setFfmpegError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    invoke<void>("check_ffmpeg").catch((e: string) => setFfmpegError(e));
  }, []);

  if (ffmpegError) {
    return (
      <div style={{ padding: 32, color: "red" }}>
        <h2>FFmpeg Error</h2>
        <p>{ffmpegError}</p>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#111", color: "#fff" }}>
      <button onClick={() => setShowImport(true)} style={{ margin: 16, alignSelf: "flex-start", padding: "8px 16px", background: "#5b6eff", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>
        Import Photos
      </button>
      {showImport && <PhotoGrid onClose={() => setShowImport(false)} />}
    </div>
  );
}
```

- [ ] **Step 5: Install Tauri dialog plugin**

```bash
npm install @tauri-apps/plugin-dialog
```

In `src-tauri/Cargo.toml`:
```toml
tauri-plugin-dialog = "2"
```

- [ ] **Step 6: Test import flow manually**

```bash
npm run tauri dev
```

Click "Import Photos" → choose some JPEGs → verify thumbnails appear in grid → click "Add N photos" → modal closes.

- [ ] **Step 7: Commit**

```bash
git add src/components/PhotoGrid/ src/utils/ src/App.tsx
git commit -m "feat: PhotoGrid import modal with HEIC warning + thumbnail display"
```

---

## Task 8: Filmstrip with drag-to-reorder

**Files:**
- Create: `src/components/Filmstrip/FilmstripCell.tsx`
- Create: `src/components/Filmstrip/Filmstrip.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create FilmstripCell**

Create `src/components/Filmstrip/FilmstripCell.tsx`:
```tsx
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { assetUrl } from "../../utils/tauriAsset";
import type { Photo } from "../../store/types";

interface Props {
  photo: Photo;
  index: number;
  isActive: boolean; // currently shown in preview
  bpm: number;
  beatsPerPhoto: number;
}

export function FilmstripCell({ photo, index, isActive, bpm, beatsPerPhoto }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id });
  const beats = photo.beatsOverride ?? beatsPerPhoto;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        flexShrink: 0,
        width: 80,
        position: "relative",
        cursor: "grab",
        border: isActive ? "2px solid #5b6eff" : "2px solid transparent",
        borderRadius: 4,
        overflow: "visible",
      }}
      {...attributes}
      {...listeners}
    >
      <img
        src={assetUrl(photo.thumbPath)}
        alt=""
        style={{ width: 80, height: 60, objectFit: "cover", display: "block", borderRadius: 2 }}
      />
      <div style={{
        position: "absolute",
        bottom: 2,
        right: 2,
        background: "rgba(0,0,0,0.7)",
        color: "#fff",
        fontSize: 9,
        padding: "1px 4px",
        borderRadius: 2,
      }}>
        {beats}b
      </div>
      <div style={{ textAlign: "center", fontSize: 9, color: "#888", marginTop: 2 }}>
        {index + 1}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create Filmstrip**

Create `src/components/Filmstrip/Filmstrip.tsx`:
```tsx
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useProjectStore } from "../../store/projectStore";
import { FilmstripCell } from "./FilmstripCell";

interface Props {
  activePhotoIndex: number;
  onCellClick: (index: number) => void;
}

export function Filmstrip({ activePhotoIndex, onCellClick }: Props) {
  const photos = useProjectStore((s) => s.project.photos);
  const bpm = useProjectStore((s) => s.project.bpm);
  const beatsPerPhoto = useProjectStore((s) => s.project.beatsPerPhoto);
  const reorderPhotos = useProjectStore((s) => s.reorderPhotos);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = photos.findIndex((p) => p.id === active.id);
    const toIndex = photos.findIndex((p) => p.id === over.id);
    if (fromIndex !== -1 && toIndex !== -1) reorderPhotos(fromIndex, toIndex);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={photos.map((p) => p.id)} strategy={horizontalListSortingStrategy}>
        <div
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            padding: "8px 12px",
            background: "#161622",
            minHeight: 90,
            alignItems: "flex-start",
          }}
        >
          {photos.map((photo, i) => (
            <div key={photo.id} onClick={() => onCellClick(i)}>
              <FilmstripCell
                photo={photo}
                index={i}
                isActive={i === activePhotoIndex}
                bpm={bpm}
                beatsPerPhoto={beatsPerPhoto}
              />
            </div>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
```

- [ ] **Step 3: Wire Filmstrip into App.tsx**

Replace `src/App.tsx`:
```tsx
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PhotoGrid } from "./components/PhotoGrid/PhotoGrid";
import { Filmstrip } from "./components/Filmstrip/Filmstrip";

export default function App() {
  const [ffmpegError, setFfmpegError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    invoke<void>("check_ffmpeg").catch((e: string) => setFfmpegError(e));
  }, []);

  if (ffmpegError) {
    return <div style={{ padding: 32, color: "red" }}><h2>FFmpeg Error</h2><p>{ffmpegError}</p></div>;
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#111", color: "#fff" }}>
      <Filmstrip activePhotoIndex={activeIndex} onCellClick={setActiveIndex} />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
        Preview canvas — Task 12
      </div>
      <div style={{ padding: 8, borderTop: "1px solid #222" }}>
        <button onClick={() => setShowImport(true)} style={{ padding: "6px 14px", background: "#5b6eff", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>
          + Import Photos
        </button>
      </div>
      {showImport && <PhotoGrid onClose={() => setShowImport(false)} />}
    </div>
  );
}
```

- [ ] **Step 4: Manual test — drag reorder**

```bash
npm run tauri dev
```

Import 5+ photos → verify they appear in filmstrip → drag one to reorder → verify order changes.

- [ ] **Step 5: Commit**

```bash
git add src/components/Filmstrip/
git commit -m "feat: drag-to-reorder Filmstrip with beat badge"
```

---

## Task 9: Hard-cut render pipeline (proves end-to-end)

**Files:**
- Implement: `src-tauri/src/ffmpeg/render_pipeline.rs`
- Implement: `src-tauri/src/commands/render.rs`
- Implement: `src-tauri/src/commands/disk.rs`
- Create: `src/components/ExportPanel/ExportPanel.tsx`

- [ ] **Step 1: Implement disk space check**

Replace `src-tauri/src/commands/disk.rs`:
```rust
use std::path::Path;

#[tauri::command]
pub fn check_disk_space(path: String, required_bytes: u64) -> Result<bool, String> {
    let p = Path::new(&path);
    // Use the drive root
    let root = p.ancestors().last().unwrap_or(p);
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        let wide: Vec<u16> = root.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
        let mut free: u64 = 0;
        let mut total: u64 = 0;
        let mut total_free: u64 = 0;
        unsafe {
            windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW(
                wide.as_ptr(),
                &mut free,
                &mut total,
                &mut total_free,
            );
        }
        return Ok(free >= required_bytes);
    }
    #[cfg(not(target_os = "windows"))]
    Ok(true)
}
```

Add `windows-sys` to `Cargo.toml`:
```toml
[target.'cfg(windows)'.dependencies]
windows-sys = { version = "0.52", features = ["Win32_Storage_FileSystem"] }
```

- [ ] **Step 2: Implement render pipeline builder**

Replace `src-tauri/src/ffmpeg/render_pipeline.rs`:
```rust
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;

pub const CHUNK_SIZE: usize = 50;

/// Bitrate estimate in bytes for disk space check
pub fn estimate_bytes(duration_s: f64, width: u32, height: u32, fps: u32) -> u64 {
    let bitrate_bps: u64 = if height >= 2160 { 20_000_000 }
        else if height >= 1080 { 8_000_000 }
        else { 4_000_000 };
    // 2.5x safety factor for intermediates
    ((bitrate_bps as f64 / 8.0) * duration_s * 2.5) as u64
}

pub struct PhotoItem {
    pub path: PathBuf,
    pub frame_count: u32,
}

pub struct RenderResult {
    pub output_path: PathBuf,
}

pub fn build_filter_complex(n: usize, width: u32, height: u32) -> String {
    let scales: String = (0..n)
        .map(|i| format!("[{i}:v]scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},setsar=1,format=yuv420p[v{i}]"))
        .collect::<Vec<_>>()
        .join(";");
    let inputs: String = (0..n).map(|i| format!("[v{i}]")).collect::<Vec<_>>().join("");
    format!("{scales};{inputs}concat=n={n}:v=1:a=0[out]")
}

pub fn render_chunk(
    ffmpeg: &Path,
    photos: &[PhotoItem],
    fps: u32,
    width: u32,
    height: u32,
    output: &Path,
) -> anyhow::Result<()> {
    let mut cmd = Command::new(ffmpeg);
    cmd.stdout(Stdio::null()).stderr(Stdio::piped());

    // Add CREATE_NO_WINDOW on Windows to suppress console
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    for item in photos {
        // Use -framerate + -t for reliable input duration.
        // -vframes as an input flag is unreliable across ffmpeg builds.
        let duration_s = item.frame_count as f64 / fps as f64;
        cmd.args(["-loop", "1", "-framerate", &fps.to_string(), "-t", &format!("{duration_s:.6}"), "-i"]);
        cmd.arg(&item.path);
    }

    let filter = build_filter_complex(photos.len(), width, height);
    cmd.args(["-filter_complex", &filter]);
    cmd.args(["-map", "[out]", "-r", &fps.to_string(), "-c:v", "libx264",
              "-pix_fmt", "yuv420p",
              "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
              "-y"]);
    cmd.arg(output);

    let out = cmd.output()?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(anyhow::anyhow!("FFmpeg chunk failed: {stderr}"));
    }
    Ok(())
}

pub fn build_concat_list(chunk_paths: &[PathBuf]) -> String {
    chunk_paths.iter()
        .map(|p| format!("file '{}'\n", p.to_string_lossy().replace('\\', "/")))
        .collect()
}
```

- [ ] **Step 3: Implement render_video command**

Replace `src-tauri/src/commands/render.rs`:
```rust
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use tauri::{Manager, Emitter};
use crate::ffmpeg::render_pipeline::{render_chunk, build_concat_list, PhotoItem, CHUNK_SIZE, estimate_bytes};

static CANCEL_FLAGS: std::sync::OnceLock<Arc<Mutex<HashMap<String, bool>>>> =
    std::sync::OnceLock::new();

fn cancel_flags() -> Arc<Mutex<HashMap<String, bool>>> {
    CANCEL_FLAGS.get_or_init(|| Arc::new(Mutex::new(HashMap::new()))).clone()
}

fn is_cancelled(render_id: &str) -> bool {
    cancel_flags().lock().unwrap().get(render_id).copied().unwrap_or(false)
}

#[derive(Deserialize)]
pub struct PhotoRenderItem {
    pub path: String,
    pub frame_count: u32,
}

#[derive(Deserialize)]
pub struct RenderConfig {
    pub render_id: String,
    pub output_path: String,
    pub photos: Vec<PhotoRenderItem>,
    pub fps: u32,
    pub width: u32,
    pub height: u32,
    pub transition: String,
    pub song_path: Option<String>,
    pub first_beat_offset_ms: f64,
    pub total_duration_s: f64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RenderProgress {
    pub chunk_index: usize,
    pub total_chunks: usize,
    pub frames_encoded: u32,
}

#[tauri::command]
pub async fn render_video(
    app: tauri::AppHandle,
    config: RenderConfig,
) -> Result<String, String> {
    // Disk space pre-check
    let required = estimate_bytes(config.total_duration_s, config.width, config.height, config.fps);
    let output_dir = Path::new(&config.output_path).parent().unwrap_or(Path::new("."));
    let has_space = crate::commands::disk::check_disk_space(
        output_dir.to_string_lossy().into_owned(),
        required,
    )?;
    if !has_space {
        return Err(format!(
            "Not enough disk space. Estimated: {}MB required.",
            required / 1_000_000
        ));
    }

    let ffmpeg = crate::ffmpeg::ffmpeg_binary(&app).map_err(|e| e.to_string())?;

    // Create render workdir
    let work_dir = std::env::temp_dir().join(format!("photocomp-{}", config.render_id));
    std::fs::create_dir_all(&work_dir).map_err(|e| e.to_string())?;

    cancel_flags().lock().unwrap().insert(config.render_id.clone(), false);

    let photos: Vec<PhotoItem> = config.photos.iter().map(|p| PhotoItem {
        path: PathBuf::from(&p.path),
        frame_count: p.frame_count,
    }).collect();

    let chunks: Vec<&[PhotoItem]> = photos.chunks(CHUNK_SIZE).collect();
    let total_chunks = chunks.len();
    let mut chunk_paths: Vec<PathBuf> = Vec::new();
    let mut frames_encoded: u32 = 0;

    for (i, chunk) in chunks.iter().enumerate() {
        if is_cancelled(&config.render_id) {
            std::fs::remove_dir_all(&work_dir).ok();
            cancel_flags().lock().unwrap().remove(&config.render_id);
            return Err("cancelled".to_string());
        }
        let chunk_path = work_dir.join(format!("chunk_{i:04}.mp4"));
        render_chunk(&ffmpeg, chunk, config.fps, config.width, config.height, &chunk_path)
            .map_err(|e| e.to_string())?;
        chunk_paths.push(chunk_path);
        frames_encoded += chunk.iter().map(|p| p.frame_count).sum::<u32>();

        app.emit("render_progress", RenderProgress {
            chunk_index: i,
            total_chunks,
            frames_encoded,
        }).ok();
    }

    // Write concat list
    let concat_file = work_dir.join("concat.txt");
    std::fs::write(&concat_file, build_concat_list(&chunk_paths)).map_err(|e| e.to_string())?;

    // Final mux
    let mut cmd = std::process::Command::new(&ffmpeg);
    cmd.args(["-y", "-f", "concat", "-safe", "0", "-i"]);
    cmd.arg(&concat_file);

    if let Some(song) = &config.song_path {
        let offset_s = config.first_beat_offset_ms / 1000.0;
        cmd.args(["-ss", &offset_s.to_string(), "-i", song]);
        cmd.args(["-c:v", "copy", "-c:a", "aac", "-t", &config.total_duration_s.to_string()]);
    } else {
        cmd.args(["-c:v", "copy"]);
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    cmd.arg(&config.output_path);
    let out = cmd.output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(format!("FFmpeg mux failed: {}", String::from_utf8_lossy(&out.stderr)));
    }

    // Cleanup workdir
    std::fs::remove_dir_all(&work_dir).ok();

    Ok(config.output_path.clone())
}

#[tauri::command]
pub async fn cancel_render(render_id: String) -> Result<(), String> {
    // Set cancel flag — render loop checks between chunks and exits
    cancel_flags().lock().unwrap().insert(render_id.clone(), true);
    // Also nuke workdir so any in-progress FFmpeg chunk fails fast
    let work_dir = std::env::temp_dir().join(format!("photocomp-{render_id}"));
    std::fs::remove_dir_all(&work_dir).ok();
    Ok(())
}
```

- [ ] **Step 4: Create ExportPanel**

Create `src/components/ExportPanel/ExportPanel.tsx`:
```tsx
import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { nanoid } from "nanoid";
import { useProjectStore } from "../../store/projectStore";
import { buildCumulativeTimeline, buildFrameCounts } from "../../lib/cumulativeTimeline";
import type { RenderProgress } from "../../store/types";

export function ExportPanel() {
  const project = useProjectStore((s) => s.project);
  const setOutputConfig = useProjectStore((s) => s.setOutputConfig);
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renderId, setRenderId] = useState<string | null>(null);

  const resolutionMap = { "720p": [1280, 720], "1080p": [1920, 1080], "4k": [3840, 2160] } as const;
  const [width, height] = resolutionMap[project.outputConfig.resolution];

  const handleRender = async () => {
    const outputPath = await save({ filters: [{ name: "MP4 Video", extensions: ["mp4"] }] });
    if (!outputPath) return;

    setError(null);
    setRendering(true);
    const id = nanoid();
    setRenderId(id);

    const frameCounts = buildFrameCounts(
      project.photos,
      project.bpm,
      project.beatsPerPhoto,
      project.firstBeatOffsetMs,
      project.outputConfig.fps
    );
    const times = buildCumulativeTimeline(project.photos, project.bpm, project.beatsPerPhoto, project.firstBeatOffsetMs);
    const lastTime = times[times.length - 1] ?? 0;
    const lastBeats = project.photos[project.photos.length - 1]?.beatsOverride ?? project.beatsPerPhoto;
    const totalDuration = lastTime + (60 / project.bpm) * lastBeats;

    const unlisten = await listen<RenderProgress>("render_progress", (e) => setProgress(e.payload));

    try {
      const result = await invoke<string>("render_video", {
        config: {
          render_id: id,
          output_path: outputPath,
          photos: project.photos.map((p, i) => ({ path: p.originalPath, frame_count: frameCounts[i] })),
          fps: project.outputConfig.fps,
          width,
          height,
          transition: project.globalTransition,
          song_path: project.song?.path ?? null,
          first_beat_offset_ms: project.firstBeatOffsetMs,
          total_duration_s: totalDuration,
        },
      });
      alert(`Render complete: ${result}`);
    } catch (e: any) {
      setError(String(e));
    } finally {
      setRendering(false);
      setProgress(null);
      unlisten();
    }
  };

  const handleCancel = async () => {
    if (renderId) await invoke("cancel_render", { renderId });
    setRendering(false);
    setProgress(null);
  };

  return (
    <div style={{ padding: "8px 12px", borderTop: "1px solid #222", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <select
        value={project.outputConfig.resolution}
        onChange={(e) => setOutputConfig({ ...project.outputConfig, resolution: e.target.value as any })}
        style={{ background: "#222", color: "#fff", border: "1px solid #444", borderRadius: 4, padding: "4px 8px" }}
      >
        <option value="720p">720p</option>
        <option value="1080p">1080p</option>
        <option value="4k">4K</option>
      </select>

      <select
        value={project.outputConfig.fps}
        onChange={(e) => setOutputConfig({ ...project.outputConfig, fps: Number(e.target.value) as any })}
        style={{ background: "#222", color: "#fff", border: "1px solid #444", borderRadius: 4, padding: "4px 8px" }}
      >
        <option value={24}>24fps</option>
        <option value={30}>30fps</option>
        <option value={60}>60fps</option>
      </select>

      {!rendering ? (
        <button
          onClick={handleRender}
          disabled={project.photos.length === 0}
          style={{ padding: "6px 16px", background: "#5b6eff", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}
        >
          Export MP4
        </button>
      ) : (
        <>
          <span style={{ color: "#aaa", fontSize: 13 }}>
            {progress ? `Chunk ${progress.chunkIndex + 1}/${progress.totalChunks}` : "Starting…"}
          </span>
          <button onClick={handleCancel} style={{ padding: "6px 12px", background: "#a03030", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>
            Cancel
          </button>
        </>
      )}

      {error && <span style={{ color: "#f66", fontSize: 12 }}>{error}</span>}
    </div>
  );
}
```

- [ ] **Step 5: Add save dialog plugin**

```bash
npm install @tauri-apps/plugin-dialog
```

Register `tauri-plugin-dialog` if not already done in `lib.rs`.

- [ ] **Step 6: Wire ExportPanel into App.tsx — add at bottom of layout**

In `src/App.tsx` add `<ExportPanel />` below the controls placeholder.

- [ ] **Step 7: End-to-end render test — 10 photos**

```bash
npm run tauri dev
```

Import 10 JPEGs → click Export MP4 → choose save path → verify a valid MP4 is created and plays back with correct timing.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/ffmpeg/ src-tauri/src/commands/ src/components/ExportPanel/
git commit -m "feat: chunked hard-cut render pipeline + ExportPanel"
```

---

## Task 10: BPM controls + audio import

**Files:**
- Create: `src/hooks/useAudioEngine.ts`
- Create: `src/components/BpmControls/BpmControls.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Implement useAudioEngine**

Create `src/hooks/useAudioEngine.ts`:
```ts
import { useRef, useCallback, useState } from "react";

export interface AudioEngine {
  load: (filePath: string) => Promise<number>; // returns durationMs
  play: (fromSeconds?: number) => void;
  pause: () => void;
  seek: (toSeconds: number) => void;
  currentTime: () => number;
  duration: number;
  isPlaying: boolean;
  audioBuffer: AudioBuffer | null;
}

export function useAudioEngine(): AudioEngine {
  const contextRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);   // audioContext.currentTime when play started
  const offsetRef = useRef<number>(0);      // offset into buffer when play started
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);

  const getContext = useCallback(() => {
    if (!contextRef.current || contextRef.current.state === "closed") {
      contextRef.current = new AudioContext();
    }
    return contextRef.current;
  }, []);

  const load = useCallback(async (filePath: string): Promise<number> => {
    const ctx = getContext();
    // Tauri asset protocol for local files
    const { convertFileSrc } = await import("@tauri-apps/api/core");
    const url = convertFileSrc(filePath);
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    bufferRef.current = decoded;
    setAudioBuffer(decoded);
    setDuration(decoded.duration);
    return decoded.duration * 1000; // return durationMs directly — don't read React state
  }, [getContext]);

  const play = useCallback((fromSeconds = 0) => {
    const ctx = getContext();
    const buf = bufferRef.current;
    if (!buf) return;
    sourceRef.current?.stop();
    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.connect(ctx.destination);
    source.start(0, fromSeconds);
    source.onended = () => setIsPlaying(false);
    sourceRef.current = source;
    startTimeRef.current = ctx.currentTime;
    offsetRef.current = fromSeconds;
    setIsPlaying(true);
  }, [getContext]);

  const pause = useCallback(() => {
    sourceRef.current?.stop();
    offsetRef.current += (contextRef.current?.currentTime ?? 0) - startTimeRef.current;
    setIsPlaying(false);
  }, []);

  const seek = useCallback((toSeconds: number) => {
    const wasPlaying = isPlaying;
    if (isPlaying) {
      sourceRef.current?.stop();
    }
    offsetRef.current = toSeconds;
    if (wasPlaying) play(toSeconds);
  }, [isPlaying, play]);

  const currentTime = useCallback((): number => {
    if (!isPlaying) return offsetRef.current;
    return offsetRef.current + ((contextRef.current?.currentTime ?? 0) - startTimeRef.current);
  }, [isPlaying]);

  return { load, play, pause, seek, currentTime, duration, isPlaying, audioBuffer };
}
```

- [ ] **Step 2: Create BpmControls**

Create `src/components/BpmControls/BpmControls.tsx`:
```tsx
import { useState, useCallback, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useProjectStore } from "../../store/projectStore";
import { tapTempoMedian } from "../../lib/tapTempo";
import type { AudioEngine } from "../../hooks/useAudioEngine";

interface Props {
  audioEngine: AudioEngine;
}

export function BpmControls({ audioEngine }: Props) {
  const bpm = useProjectStore((s) => s.project.bpm);
  const firstBeatOffsetMs = useProjectStore((s) => s.project.firstBeatOffsetMs);
  const setBpm = useProjectStore((s) => s.setBpm);
  const setFirstBeatOffsetMs = useProjectStore((s) => s.setFirstBeatOffsetMs);
  const setSong = useProjectStore((s) => s.setSong);
  const song = useProjectStore((s) => s.project.song);

  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const [bpmInput, setBpmInput] = useState(String(bpm));

  const handleImportSong = async () => {
    const path = await open({ filters: [{ name: "Audio", extensions: ["mp3", "aac", "wav", "flac", "m4a"] }] });
    if (!path || Array.isArray(path)) return;
    const durationMs = await audioEngine.load(path); // load() returns duration
    setSong({ path, durationMs });
  };

  const handleTap = useCallback(() => {
    const now = performance.now();
    setTapTimes((prev) => {
      const updated = [...prev, now].slice(-9);
      const detected = tapTempoMedian(updated);
      if (detected !== null) {
        const rounded = Math.round(detected * 10) / 10;
        setBpm(rounded);
        setBpmInput(String(rounded));
      }
      return updated;
    });
  }, [setBpm]);

  const handleBpmBlur = () => {
    const val = parseFloat(bpmInput);
    if (!isNaN(val) && val > 0) setBpm(val);
    else setBpmInput(String(bpm));
  };

  const handlePlay = () => {
    if (audioEngine.isPlaying) audioEngine.pause();
    else audioEngine.play(firstBeatOffsetMs / 1000);
  };

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 12px", flexWrap: "wrap" }}>
      <button onClick={handleImportSong} style={{ padding: "4px 10px", background: "#333", color: "#fff", border: "1px solid #555", borderRadius: 4, cursor: "pointer" }}>
        {song ? "Change Song" : "Import Song"}
      </button>

      {song && (
        <button onClick={handlePlay} style={{ padding: "4px 10px", background: "#333", color: "#fff", border: "1px solid #555", borderRadius: 4, cursor: "pointer" }}>
          {audioEngine.isPlaying ? "⏸" : "▶"}
        </button>
      )}

      <label style={{ color: "#aaa", fontSize: 13 }}>
        BPM:
        <input
          type="number"
          value={bpmInput}
          step="0.1"
          min="1"
          onChange={(e) => setBpmInput(e.target.value)}
          onBlur={handleBpmBlur}
          style={{ width: 70, marginLeft: 6, background: "#222", color: "#fff", border: "1px solid #444", borderRadius: 4, padding: "2px 6px" }}
        />
      </label>

      <button onClick={handleTap} style={{ padding: "4px 14px", background: "#333", color: "#fff", border: "1px solid #555", borderRadius: 4, cursor: "pointer" }}>
        Tap
      </button>

      <label style={{ color: "#aaa", fontSize: 13 }}>
        Offset:
        <input
          type="number"
          value={firstBeatOffsetMs}
          step="10"
          onChange={(e) => setFirstBeatOffsetMs(Number(e.target.value))}
          style={{ width: 70, marginLeft: 6, background: "#222", color: "#fff", border: "1px solid #444", borderRadius: 4, padding: "2px 6px" }}
        />
        ms
      </label>
    </div>
  );
}
```

- [ ] **Step 3: Wire into App.tsx and thread audioEngine through**

Update `src/App.tsx` to instantiate `useAudioEngine` at the root and pass to `BpmControls`. Also thread it down to `PreviewCanvas` (Task 12).

- [ ] **Step 4: Render 2000-photo drift test**

Generate 2000 identical test photos (any 1px×1px JPEG), import all, set BPM=127, fps=30. Export MP4. Measure video duration with ffprobe:

```bash
ffprobe -v error -show_entries format=duration -of csv=p=0 output.mp4
```

Expected duration: `2000 × (60/127) ≈ 944.88s`. Result must be within ±0.033s (1 frame at 30fps).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAudioEngine.ts src/components/BpmControls/
git commit -m "feat: BPM controls with manual input, tap-tempo, offset slider + audio import"
```

---

## Task 11: Preview Canvas

**Files:**
- Create: `src/hooks/usePreviewSync.ts`
- Create: `src/components/PreviewCanvas/PreviewCanvas.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Implement usePreviewSync**

Create `src/hooks/usePreviewSync.ts`:
```ts
import { useRef, useEffect, useCallback } from "react";
import { buildCumulativeTimeline, binarySearchLE } from "../lib/cumulativeTimeline";
import type { Photo } from "../store/types";
import type { AudioEngine } from "./useAudioEngine";

interface Options {
  photos: Photo[];
  bpm: number;
  beatsPerPhoto: number;
  firstBeatOffsetMs: number;
  audioEngine: AudioEngine;
  onPhotoChange: (index: number) => void;
}

export function usePreviewSync({
  photos,
  bpm,
  beatsPerPhoto,
  firstBeatOffsetMs,
  audioEngine,
  onPhotoChange,
}: Options) {
  const rafRef = useRef<number>(0);
  const currentIdxRef = useRef<number>(-1);
  const timesRef = useRef<number[]>([]);

  // Recompute timeline whenever inputs change
  useEffect(() => {
    timesRef.current = buildCumulativeTimeline(photos, bpm, beatsPerPhoto, firstBeatOffsetMs);
  }, [photos, bpm, beatsPerPhoto, firstBeatOffsetMs]);

  const loop = useCallback(() => {
    const t = audioEngine.currentTime();
    const times = timesRef.current;
    if (times.length > 0) {
      // During pre-roll (t < times[0]) show photo 0 — no blank period
      const idx = Math.min(binarySearchLE(times, t), photos.length - 1);
      if (idx !== currentIdxRef.current) {
        currentIdxRef.current = idx;
        onPhotoChange(idx);
      }
    }
    rafRef.current = requestAnimationFrame(loop);
  }, [audioEngine, photos.length, onPhotoChange]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [loop]);
}
```

- [ ] **Step 2: Create PreviewCanvas**

Create `src/components/PreviewCanvas/PreviewCanvas.tsx`:
```tsx
import { useRef, useEffect } from "react";
import { assetUrl } from "../../utils/tauriAsset";
import type { Photo } from "../../store/types";

interface Props {
  photos: Photo[];
  activeIndex: number;
}

export function PreviewCanvas({ photos, activeIndex }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || photos.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const photo = photos[activeIndex];
    if (!photo) return;

    const drawImg = (img: HTMLImageElement) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Cover: scale to fill canvas preserving aspect ratio
      const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
      const sw = img.width * scale;
      const sh = img.height * scale;
      const sx = (canvas.width - sw) / 2;
      const sy = (canvas.height - sh) / 2;
      ctx.drawImage(img, sx, sy, sw, sh);
    };

    const cached = imgCacheRef.current.get(photo.thumbPath);
    if (cached) {
      drawImg(cached);
    } else {
      const img = new Image();
      img.src = assetUrl(photo.thumbPath);
      img.onload = () => {
        imgCacheRef.current.set(photo.thumbPath, img);
        drawImg(img);
      };
    }
  }, [activeIndex, photos]);

  return (
    <canvas
      ref={canvasRef}
      width={1280}
      height={720}
      style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
    />
  );
}
```

- [ ] **Step 3: Wire into App.tsx with usePreviewSync**

In `src/App.tsx`, use `usePreviewSync` to drive `activeIndex` from audio playback, and connect filmstrip click to `audioEngine.seek`:

```tsx
// In App.tsx:
const [activeIndex, setActiveIndex] = useState(0);

usePreviewSync({
  photos: project.photos,
  bpm: project.bpm,
  beatsPerPhoto: project.beatsPerPhoto,
  firstBeatOffsetMs: project.firstBeatOffsetMs,
  audioEngine,
  onPhotoChange: setActiveIndex,
});

const handleFilmstripClick = (index: number) => {
  const times = buildCumulativeTimeline(project.photos, project.bpm, project.beatsPerPhoto, project.firstBeatOffsetMs);
  audioEngine.seek(times[index] ?? 0);
  setActiveIndex(index);
};
```

Replace preview placeholder div with `<PreviewCanvas photos={project.photos} activeIndex={activeIndex} />`.

- [ ] **Step 4: Manual preview test**

Import photos + song → press play → verify photos change in sync with music beat. Click filmstrip cell → verify preview seeks to that photo.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePreviewSync.ts src/components/PreviewCanvas/
git commit -m "feat: preview canvas with AudioContext sync and filmstrip seek"
```

---

## Task 12: ControlsPanel (crop, alignment, beats/photo, transition)

**Files:**
- Create: `src/components/ControlsPanel/ControlsPanel.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create ControlsPanel**

Create `src/components/ControlsPanel/ControlsPanel.tsx`:
```tsx
import { useProjectStore } from "../../store/projectStore";

export function ControlsPanel() {
  const project = useProjectStore((s) => s.project);
  const setCropRatio = useProjectStore((s) => s.setCropRatio);
  const setAlignment = useProjectStore((s) => s.setAlignment);
  const setBeatsPerPhoto = useProjectStore((s) => s.setBeatsPerPhoto);
  const setGlobalTransition = useProjectStore((s) => s.setGlobalTransition);

  const selectStyle = { background: "#222", color: "#fff", border: "1px solid #444", borderRadius: 4, padding: "3px 8px" };

  return (
    <div style={{ display: "flex", gap: 16, padding: "8px 12px", alignItems: "center", flexWrap: "wrap", borderTop: "1px solid #1e1e1e" }}>
      <label style={{ color: "#aaa", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
        Crop:
        <select value={project.cropRatio} onChange={(e) => setCropRatio(e.target.value as any)} style={selectStyle}>
          <option value="16:9">16:9</option>
          <option value="9:16">9:16</option>
          <option value="1:1">1:1</option>
          <option value="4:3">4:3</option>
        </select>
      </label>

      <label style={{ color: "#aaa", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
        Align:
        <select value={project.alignment} onChange={(e) => setAlignment(e.target.value as any)} style={selectStyle}>
          <option value="center">Center</option>
          <option value="top">Top</option>
          <option value="bottom">Bottom</option>
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
      </label>

      <label style={{ color: "#aaa", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
        Beats/photo:
        <input
          type="number"
          min="0.25"
          step="0.25"
          value={project.beatsPerPhoto}
          onBlur={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v > 0) setBeatsPerPhoto(v);
          }}
          onChange={(e) => e.target.value}
          style={{ width: 60, background: "#222", color: "#fff", border: "1px solid #444", borderRadius: 4, padding: "3px 6px" }}
        />
      </label>

      <label style={{ color: "#aaa", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
        Transition:
        <select value={project.globalTransition} onChange={(e) => setGlobalTransition(e.target.value as any)} style={selectStyle}>
          <option value="cut">Hard cut</option>
          <option value="crossfade">Crossfade</option>
        </select>
      </label>
    </div>
  );
}
```

- [ ] **Step 2: Wire into App.tsx**

Add `<ControlsPanel />` between preview and export panel in App.tsx layout.

- [ ] **Step 3: Verify crop ratio is passed to render**

In `ExportPanel.tsx`, the `RenderConfig` already passes `width` and `height` from resolution map. The crop ratio needs to be passed too and respected in FFmpeg filter. Update `render_pipeline.rs` to accept `crop_ratio` and compute actual crop dimensions:

In `render_pipeline.rs`, update `render_chunk` to accept `crop_ratio: &str` and compute crop:
```rust
pub fn crop_dimensions(width: u32, height: u32, crop_ratio: &str) -> (u32, u32) {
    match crop_ratio {
        "16:9" => {
            let h = height;
            let w = (h * 16 / 9).min(width);
            (w, h)
        }
        "9:16" => {
            // Portrait: height is the long side. Compute width from height.
            let h = height;
            let w = (h * 9 / 16).min(width);
            (w, h)
        }
        "1:1" => {
            let s = width.min(height);
            (s, s)
        }
        "4:3" => {
            let h = height;
            let w = (h * 4 / 3).min(width);
            (w, h)
        }
        _ => (width, height),
    }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ControlsPanel/
git commit -m "feat: ControlsPanel — crop ratio, alignment, beats/photo, transition"
```

---

## Task 13: Project save/load + undo/redo

**Files:**
- Create: `src/lib/projectPersistence.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create persistence helpers**

Create `src/lib/projectPersistence.ts`:
```ts
import { writeTextFile, readTextFile, BaseDirectory } from "@tauri-apps/plugin-fs";
import { save, open } from "@tauri-apps/plugin-dialog";
import type { Project } from "../store/types";

export async function saveProject(project: Project, filePath?: string): Promise<string> {
  const path = filePath ?? await save({ filters: [{ name: "Project", extensions: ["photocomp"] }] });
  if (!path) throw new Error("cancelled");
  await writeTextFile(path, JSON.stringify(project, null, 2));
  return path;
}

export async function loadProject(): Promise<Project | null> {
  const path = await open({ filters: [{ name: "Project", extensions: ["photocomp"] }] });
  if (!path || Array.isArray(path)) return null;
  const text = await readTextFile(path as string);
  const project = JSON.parse(text) as Project;
  if (project.schemaVersion !== 1) throw new Error(`Unknown schema version: ${project.schemaVersion}`);
  return project;
}
```

- [ ] **Step 2: Add autosave + load to App.tsx**

In App.tsx, import the persistence functions with distinct names and add keyboard shortcuts and autosave:
```tsx
import { saveProject, loadProject as loadProjectFile } from "./lib/projectPersistence";
```

Add `loadProjectIntoStore` from the store (distinct name avoids collision with the module function):
```tsx
const loadProjectIntoStore = useProjectStore((s) => s.loadProject);
```

```tsx
// Ctrl+Z undo, Ctrl+Y redo
useEffect(() => {
  const handle = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === "z") useProjectStore.temporal.getState().undo();
    if (e.ctrlKey && e.key === "y") useProjectStore.temporal.getState().redo();
  };
  window.addEventListener("keydown", handle);
  return () => window.removeEventListener("keydown", handle);
}, []);

// Autosave
const project = useProjectStore((s) => s.project);
const [savePath, setSavePath] = useState<string | null>(null);
useEffect(() => {
  if (!savePath) return;
  const timer = setTimeout(() => {
    saveProject(project, savePath).catch(console.error);
  }, 1000);
  return () => clearTimeout(timer);
}, [project, savePath]);
```

Add Save/Load buttons to the UI:
```tsx
<button onClick={async () => {
  const path = await saveProject(project, savePath ?? undefined);
  setSavePath(path);
}} style={{ padding: "4px 10px", background: "#333", color: "#fff", border: "1px solid #555", borderRadius: 4, cursor: "pointer" }}>
  Save
</button>
<button onClick={async () => {
  const p = await loadProjectFile();
  if (p) { loadProjectIntoStore(p); setSavePath(null); }
}} style={{ padding: "4px 10px", background: "#333", color: "#fff", border: "1px solid #555", borderRadius: 4, cursor: "pointer" }}>
  Open
</button>
```

- [ ] **Step 3: Add fs plugin**

```bash
npm install @tauri-apps/plugin-fs
```

- [ ] **Step 4: Test save/load + undo**

Import photos → reorder → Ctrl+Z → verify order reverts → save → reload app → open saved file → verify photos restored.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projectPersistence.ts
git commit -m "feat: project save/load + Ctrl+Z/Y undo/redo + autosave"
```

---

## Task 14: essentia.js BPM auto-detection

**Files:**
- Implement: `src/lib/bpmDetector.ts`
- Modify: `src/components/BpmControls/BpmControls.tsx`

- [ ] **Step 1: Install essentia.js**

```bash
npm install essentia.js
```

- [ ] **Step 2: Write BPM detector test**

Create `src/test/bpmDetector.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";

// Test the interface contract only (essentia.js requires browser AudioContext, skip in jsdom)
describe("BpmDetector interface", () => {
  it("exports detect function matching IBpmDetector", async () => {
    // Mock essentia module for test environment
    vi.mock("essentia.js", () => ({
      default: class {
        RhythmExtractor2013() { return { bpm: 120, ticks: [0, 0.5, 1.0] }; }
        arrayToVector(arr: Float32Array) { return arr; }
      },
      EssentiaWASM: {},
    }));
    const { EssentiaBpmDetector } = await import("../lib/bpmDetector");
    expect(typeof EssentiaBpmDetector.detect).toBe("function");
  });
});
```

- [ ] **Step 3: Run test — expect FAIL**

```bash
npx vitest run src/test/bpmDetector.test.ts
```

- [ ] **Step 4: Implement bpmDetector.ts**

Create `src/lib/bpmDetector.ts`:
```ts
// essentia.js WASM module — EssentiaWASM is an object, NOT a callable function.
// Import from the specific dist path to get the WASM module directly.
import Essentia from "essentia.js";
import { EssentiaWASM } from "essentia.js/dist/essentia-wasm.web.js";

export interface IBpmDetector {
  detect(buffer: AudioBuffer): Promise<{ bpm: number; beats: number[] }>;
}

let essentiaInstance: InstanceType<typeof Essentia> | null = null;

function getEssentia(): InstanceType<typeof Essentia> {
  if (!essentiaInstance) {
    // EssentiaWASM is passed directly — it is not a function to await
    essentiaInstance = new Essentia(EssentiaWASM);
  }
  return essentiaInstance;
}

export const EssentiaBpmDetector: IBpmDetector = {
  async detect(buffer: AudioBuffer) {
    const essentia = getEssentia();
    // Mono downmix
    const channelData = buffer.getChannelData(0);
    const inputSignal = essentia.arrayToVector(channelData);
    const result = essentia.RhythmExtractor2013(inputSignal);
    const bpm = result.bpm as number;
    // result.ticks is a VectorFloat — use vectorToArray to convert
    const beats = Array.from(essentia.vectorToArray(result.ticks) as Float32Array);
    return { bpm, beats };
  },
};
```

- [ ] **Step 5: Run test — expect PASS**

```bash
npx vitest run src/test/bpmDetector.test.ts
```

- [ ] **Step 6: Wire into BpmControls**

In `BpmControls.tsx`, add "Auto-detect BPM" button:
```tsx
const [detecting, setDetecting] = useState(false);

const handleAutoDetect = async () => {
  if (!audioEngine.audioBuffer) return;
  setDetecting(true);
  try {
    const { EssentiaBpmDetector } = await import("../../lib/bpmDetector");
    const { bpm } = await EssentiaBpmDetector.detect(audioEngine.audioBuffer);
    const rounded = Math.round(bpm * 10) / 10;
    setBpm(rounded);
    setBpmInput(String(rounded));
  } finally {
    setDetecting(false);
  }
};
```

Add button:
```tsx
{song && (
  <button onClick={handleAutoDetect} disabled={detecting} style={{ padding: "4px 10px", background: "#333", color: "#fff", border: "1px solid #555", borderRadius: 4, cursor: "pointer" }}>
    {detecting ? "Detecting…" : "Auto BPM"}
  </button>
)}
```

- [ ] **Step 7: Manual test**

Import a song with clear beat → click "Auto BPM" → verify detected BPM is reasonable.

- [ ] **Step 8: Commit**

```bash
git add src/lib/bpmDetector.ts src/test/bpmDetector.test.ts src/components/BpmControls/
git commit -m "feat: essentia.js BPM auto-detection with IBpmDetector interface"
```

---

## Task 15: Crossfade transition (chunked overlap render)

**Files:**
- Modify: `src-tauri/src/ffmpeg/render_pipeline.rs`

- [ ] **Step 1: Add xfade chunk builder**

In `render_pipeline.rs`, add crossfade render function:
```rust
pub fn render_chunk_crossfade(
    ffmpeg: &Path,
    photos: &[PhotoItem],
    fps: u32,
    width: u32,
    height: u32,
    output: &Path,
) -> anyhow::Result<()> {
    if photos.len() < 2 {
        return render_chunk(ffmpeg, photos, fps, width, height, output);
    }
    let mut cmd = std::process::Command::new(ffmpeg);
    cmd.stdout(std::process::Stdio::null()).stderr(std::process::Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    for item in photos {
        cmd.args(["-loop", "1", "-vframes", &item.frame_count.to_string(), "-r", &fps.to_string(), "-i"]);
        cmd.arg(&item.path);
    }

    let n = photos.len();
    let fade_frames = (fps / 4).max(1); // 25% of one beat duration, min 1 frame
    let fade_dur = fade_frames as f64 / fps as f64;

    // Build scale filters
    let scales: String = (0..n)
        .map(|i| format!("[{i}:v]scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},setsar=1,format=yuv420p[s{i}]"))
        .collect::<Vec<_>>().join(";");

    // Chain xfade filters.
    // xfade `offset` = time in the MERGED output stream where the fade starts.
    // After each merge the output duration is dur_i - fade_dur (overlap consumed).
    // So offset_k = sum(dur_0..=dur_k) - (k+1)*fade_dur.
    let mut xfade_parts: Vec<String> = Vec::new();
    let mut merged_duration = 0f64;
    let mut last_label = "[s0]".to_string();

    for i in 0..(n - 1) {
        let dur_i = photos[i].frame_count as f64 / fps as f64;
        merged_duration += dur_i;
        let fade_start = merged_duration - fade_dur;
        let out_label = if i == n - 2 { "[out]".to_string() } else { format!("[x{i}]") };
        let next_label = format!("[s{}]", i + 1);
        xfade_parts.push(format!(
            "{last_label}{next_label}xfade=transition=dissolve:duration={fade_dur:.4}:offset={fade_start:.4}{out_label}"
        ));
        last_label = if i == n - 2 { "[out]".to_string() } else { format!("[x{i}]") };
        merged_duration -= fade_dur; // consumed by this xfade
    }

    let filter = format!("{scales};{}", xfade_parts.join(";"));

    cmd.args(["-filter_complex", &filter]);
    cmd.args(["-map", "[out]", "-r", &fps.to_string(), "-c:v", "libx264",
              "-pix_fmt", "yuv420p",
              "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
              "-y"]);
    cmd.arg(output);

    let out = cmd.output()?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(anyhow::anyhow!("FFmpeg crossfade chunk failed: {stderr}"));
    }
    Ok(())
}
```

- [ ] **Step 2: Use crossfade variant in render_video command**

In `render.rs`, replace `render_chunk` call with:
```rust
if config.transition == "crossfade" {
    crate::ffmpeg::render_pipeline::render_chunk_crossfade(&ffmpeg, chunk, config.fps, config.width, config.height, &chunk_path)
} else {
    crate::ffmpeg::render_pipeline::render_chunk(&ffmpeg, chunk, config.fps, config.width, config.height, &chunk_path)
}.map_err(|e| e.to_string())?;
```

- [ ] **Step 3: Manual test — crossfade render**

Import 10 photos → set Transition = Crossfade → Export MP4 → verify smooth dissolve between photos in output.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/ffmpeg/render_pipeline.rs src-tauri/src/commands/render.rs
git commit -m "feat: crossfade transition with xfade filter in chunked render"
```

---

## Task 16: Export polish + final wiring

**Files:**
- Modify: `src/components/ExportPanel/ExportPanel.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add reveal-in-explorer after render**

Install the opener plugin (cross-platform reveal in Finder/Explorer/Files):
```bash
npm install @tauri-apps/plugin-opener
cargo add tauri-plugin-opener
```

Register in `lib.rs`:
```rust
.plugin(tauri_plugin_opener::init())
```

Add to `capabilities/default.json`:
```json
"opener:allow-reveal-item-in-file-manager"
```

In `ExportPanel.tsx`, after successful render:
```tsx
import { revealItemInDir } from "@tauri-apps/plugin-opener";

// After successful render (result is the output path):
await revealItemInDir(result);
```

This is cross-platform: opens Explorer on Windows, Finder on macOS, Files on Linux.

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 3: Full end-to-end smoke test**

1. Launch app
2. Import 20 photos
3. Import an MP3 song
4. Click "Auto BPM" — verify reasonable BPM detected
5. Set transition = Crossfade
6. Press play — verify photos change on beat
7. Click filmstrip cell #10 — verify preview seeks there
8. Ctrl+Z — verify last action undone
9. Export 1080p 30fps MP4
10. Verify output plays back at correct duration in VLC/Windows Media Player
11. Save project → close app → reopen → load project → verify state restored

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete PhotosCompilation v1 — BPM sync, preview, export, save/load"
```

---

## Post-v1 Checklist (deferred, do not implement now)

- ProRes output (`prores_ks` encoder — already in bundled FFmpeg)
- Custom WxH resolution
- Ken Burns zoompan transition
- Per-photo transition override UI
- macOS build + notarization
- Android (Tauri 2 mobile + ffmpeg-kit-android)
- BPM detector upgrade to Rust aubio-rs
- Waveform display in filmstrip
- Audio looping when song < video duration
- Multiple songs / chapters

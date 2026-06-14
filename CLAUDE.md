# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Framecut** — Beat-synced photo-to-video editor. Primary runtime is a browser web app; a legacy Tauri 2 desktop wrapper retains the Rust/FFmpeg export pipeline for Windows.

## Monorepo structure

```
packages/
  shared/     — React UI, Zustand store, platform abstraction, shared logic
  web/        — Browser app (Vite, port 1421). Deployed to Vercel.
  desktop/    — Tauri wrapper. Wires Tauri backend into the shared UI.
src-tauri/    — Rust backend (FFmpeg render, image import, HEIC conversion)
```

## Commands

```bash
# Web app (primary dev target)
npm run dev --workspace=packages/web      # localhost:1421

# Desktop app (Tauri + Vite)
npm run tauri dev

# Type check all packages
npx tsc -b packages/web/tsconfig.json

# Rust only
cd src-tauri && cargo build --target x86_64-pc-windows-gnu

# Tests
npx vitest run
```

## Platform abstraction

All platform-specific code is behind `platform()` from `packages/shared/src/lib/platform/index.ts`. Components never call Tauri directly.

```
platform().importPhotos()     — file picker + thumbnail generation
platform().loadSong()         — audio file picker, returns blob URL or file path
platform().saveProject()      — download (web) or fs write (desktop)
platform().loadProject()      — upload (web) or fs read (desktop)
platform().renderVideo()      — mediabunny WebCodecs (web) or FFmpeg (desktop)
platform().assetUrl(path)     — blob URL (web) or convertFileSrc (desktop)
```

Web implementation: `packages/web/src/platform/`
Desktop implementation: `packages/desktop/src/platform/`

## Windows Build Setup (desktop only)

Non-standard linker setup to avoid GNU ld's 65535 DLL-export ordinal overflow.

**`.cargo/config.toml`** forces the GNU target and uses WinLibs GCC as linker:
```toml
[build]
target = "x86_64-pc-windows-gnu"

[target.x86_64-pc-windows-gnu]
linker = "C:\\mingw64\\bin\\x86_64-w64-mingw32-gcc.exe"
```

`C:\mingw64` is a directory junction pointing to the WinGet-installed WinLibs MinGW64. The Cargo.toml `crate-type` is `["staticlib", "rlib"]` — **no cdylib** — to avoid the 65535 export limit.

**FFmpeg binary**: `src-tauri/binaries/ffmpeg-x86_64-pc-windows-gnu.exe` (GPL, ~194MB). MSVC-named copy is a hard link required by Tauri's build check. In dev mode, Tauri resolves `BaseDirectory::Resource` to `target/x86_64-pc-windows-gnu/debug/`, so `target/x86_64-pc-windows-gnu/debug/binaries/ffmpeg-x86_64-pc-windows-gnu.exe` must exist. All paths passed to FFmpeg are stripped of `\\?\` prefixes via `dunce::simplified`.

## Architecture

### State (`packages/shared/src/store/projectStore.ts`)

Single Zustand store wrapped in `zundo temporal()` for undo/redo. Equality check ignores `lastModified`. Undo history cleared on project load.

Key project fields: `photos[]`, `bpm`, `firstBeatOffsetMs`, `beatsPerPhoto` (float, e.g. 0.5), `cropRatio`, `alignment`, `scaleMode` ("cover"|"contain"), `globalTransition` ("cut"|"crossfade"|"stack"), `song?`, `outputConfig`.

Selection is outside `project` (excluded from undo): `selectedPhotoIds: Set<string>`, `selectionAnchorId`.

Key photo actions: `addPhotos`, `removePhoto(id)`, `removePhotos(ids[])`, `clearPhotos()`, `reorderPhotos(from, to)`, `reorderPhotosMulti(ids[], toIndex)`, `duplicatePhotos(ids[])`, `setPhotoBeatsOverride(id, beats|undefined)`, `setPhotosBeatsOverride(ids[], beats|undefined)`.

### Beat timeline (`packages/shared/src/lib/cumulativeTimeline.ts`)

`buildCumulativeTimeline(photos, bpm, beatsPerPhoto, firstBeatOffsetMs)` → `number[]` of photo start times in seconds. `buildFrameCounts(...)` → `number[]` of frame counts per photo. Used by preview sync and both render backends.

### Preview sync (`packages/shared/src/hooks/usePreviewSync.ts`)

RAF loop calls `audioEngine.currentTime()`, binary-searches the cumulative timeline, updates active photo index. Loops back to `firstBeatOffsetMs/1000` when audio passes `totalEnd`.

### Web render pipeline (`packages/web/src/platform/render.ts`)

Uses `mediabunny` (WebCodecs MP4 encoder). Per-frame `drawPhotoFrame` onto `OffscreenCanvas` → `CanvasSource`. Audio sliced from IDB-stored blob via `AudioBufferSource`. Cancellable via `cancelFlags` Map.

### Desktop render pipeline (`src-tauri/src/ffmpeg/render_pipeline.rs`)

Photos batched in chunks of 50. Each chunk → `.mp4` via FFmpeg `-filter_complex` + `concat`. Chunks concatenated with optional audio mux. Cancel via `ACTIVE_CHILDREN` kill registry.

Transition dispatch: `"cut"` → `render_chunk`, `"crossfade"` → `render_chunk_crossfade` (xfade dissolve), `"stack"` → `render_stack` (PNG compositing).

### Browser import (`packages/web/src/platform/import.ts` + `packages/shared/src/lib/browserPhotoImport.ts`)

Web Worker (`packages/shared/src/workers/photoImport.worker.ts`) processes files in batches of 8. JPEG shrink-on-load via `jpeg-decoder` equivalent in browser. Thumbnails stored as blob URLs; originals stored in IndexedDB (`packages/web/src/platform/idb.ts`).

### Desktop import pipeline (`src-tauri/src/image/`)

Rayon parallel thumbnail generation with FNV-1a hash cache. JPEG shrink-on-load, EXIF orientation applied to small buffer. HEIC → JPEG via FFmpeg.

### Audio engine (`packages/shared/src/hooks/useAudioEngine.ts`)

Web Audio API. Lazy `AudioContext`. `isPlayingRef` mirrors `isPlaying` state to avoid stale-closure bugs. `source.onended = null` before every `.stop()` to suppress spurious ended events.

### BPM detection (`packages/shared/src/lib/bpmDetector.ts`)

Uses `music-tempo` (pure JS, no WASM). Lazy-loaded on first Auto BPM click. `new MusicTempo(channelData, { sampleRate })` → `.tempo` (BPM), `.beats` (beat times array).

### Project persistence

Web: `platform().saveProject()` triggers browser download; `platform().loadProject()` uploads JSON.
Desktop: `@tauri-apps/plugin-fs` reads/writes. Both validate `schemaVersion === 1`.
Autosave: 1s debounce after any project change in `App.tsx`.

### Filmstrip (`packages/shared/src/components/Filmstrip/`)

DnD reorder (`@dnd-kit`). Height resizable 70–320px. Multi-select: Shift+click range, Ctrl+click toggle. Ctrl+D duplicates selection. Context menu: duplicate, remove, arrange by filename, analyze duplicates, bulk beats override. Touch mode checkbox selection.

### Vercel deployment

`vercel.json` builds `@framecut/web` from `packages/web/dist`. Build command: `npm install --legacy-peer-deps && npm run build --workspace=@framecut/web`. The `packages/web` build uses `tsc -b` (project references mode) which compiles `packages/shared` first.

## Key Invariants

- `beatsPerPhoto` stored as `beats / photos`. UI shows "X photos per Y beats" — `beatsPerPhoto = Y / X`.
- Frame counts: `Math.round(startTime * fps)` to `Math.round(endTime * fps)`, min 1 frame.
- Crop dimensions height-anchored: output height = render height, width = `height * ratio`, clamped to render width. **Both W and H must be even** — `yuv420p` and H.264 require it.
- `totalDurationS` = pure photo play duration only (no `firstBeatOffsetMs`). Audio offset applied via `-ss` on the audio input in desktop; audio buffer sliced at `firstBeatOffsetMs/1000` in web render.
- Preview canvas redraws on `[activeIndex, photos, cropRatio, scaleMode, globalTransition, canvasW, canvasH]`.
- `globalTransition = "stack"` skips `clearRect` in preview so photos accumulate.
- Desktop `render_stack` intermediate PNGs must specify `-pix_fmt rgb24` — `yuv420p` not supported by PNG encoder.

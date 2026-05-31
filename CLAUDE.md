# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**PhotosCompilation** — Tauri 2 desktop app that compiles photos into beat-synced MP4 videos. React/TypeScript frontend, Rust backend, FFmpeg for video encoding.

## Commands

```bash
# Dev (launches Tauri window + Vite HMR)
npm run tauri dev

# Frontend only (Vite at localhost:1420)
npm run dev

# TypeScript check + production bundle
npm run build

# Rust only (faster iteration on backend changes)
cd src-tauri && cargo build --target x86_64-pc-windows-gnu

# Type check only
npx tsc --noEmit
```

## Windows Build Setup (Critical)

This repo has a non-standard linker setup to avoid GNU ld's 65535 DLL-export ordinal overflow.

**`.cargo/config.toml`** forces the GNU target and uses WinLibs GCC as linker:
```toml
[build]
target = "x86_64-pc-windows-gnu"

[target.x86_64-pc-windows-gnu]
linker = "C:\\mingw64\\bin\\x86_64-w64-mingw32-gcc.exe"
```

`C:\mingw64` is a directory junction pointing to the WinGet-installed WinLibs MinGW64. The Cargo.toml `crate-type` for the lib is `["staticlib", "rlib"]` — **no cdylib** — to avoid the 65535 export limit.

**FFmpeg binary**: `src-tauri/binaries/ffmpeg-x86_64-pc-windows-gnu.exe` (GPL build, ~194MB). The MSVC-named copy is a hard link to the same file (required by Tauri's build check). In dev mode, Tauri resolves `BaseDirectory::Resource` to `target/x86_64-pc-windows-gnu/debug/`, so `target/x86_64-pc-windows-gnu/debug/binaries/ffmpeg-x86_64-pc-windows-gnu.exe` must exist. All paths passed to FFmpeg are stripped of `\\?\` prefixes via `dunce::simplified`.

## Architecture

### Data flow

```
User actions → Zustand store (zundo undo/redo) → React UI
                    ↓ (on export)
           invoke("render_video") → Rust
                    ↓
           FFmpeg subprocess (chunked, cancellable)
                    ↓
           Progress events → frontend
```

### State (src/store/)

`projectStore.ts` — single Zustand store wrapped in `zundo temporal()` for undo/redo. The equality check ignores `lastModified` to avoid spurious history entries. Undo history is cleared on project load.

Key project fields: `photos[]`, `bpm`, `firstBeatOffsetMs`, `beatsPerPhoto` (float, e.g. 0.5), `cropRatio`, `alignment`, `scaleMode` ("cover"|"contain"), `globalTransition` ("cut"|"crossfade"|"stack"), `song?`, `outputConfig`.

Key photo actions: `addPhotos`, `removePhoto(id)`, `clearPhotos()`, `reorderPhotos(from, to)`, `setPhotoBeatsOverride(id, beats|undefined)`.

### Beat timeline (src/lib/cumulativeTimeline.ts)

`buildCumulativeTimeline(photos, bpm, beatsPerPhoto, firstBeatOffsetMs)` → `number[]` of photo start times in seconds. Each photo's duration = `(60/bpm) * (photo.beatsOverride ?? beatsPerPhoto)`. Used by both preview sync (RAF loop) and FFmpeg frame count calculation.

### Preview sync (src/hooks/usePreviewSync.ts)

RAF loop calls `audioEngine.currentTime()`, binary-searches the cumulative timeline, updates active photo index. When audio passes `totalEnd` (last photo's beat end), it loops back to `firstBeatOffsetMs/1000`.

### Render pipeline (src-tauri/src/ffmpeg/render_pipeline.rs)

Photos are batched in chunks of 50 (`CHUNK_SIZE`). Each chunk renders to a `.mp4` via FFmpeg `-filter_complex` + `concat`. Chunks are then concatenated with optional audio mux. Cancel support: `ACTIVE_CHILDREN` registry allows `kill()` of in-flight FFmpeg subprocesses. `CANCEL_FLAGS` tracks cancellation state.

Transition dispatch in `render.rs`:
- `"cut"` / default → `render_chunk` (scale+concat filter)
- `"crossfade"` → `render_chunk_crossfade` (xfade dissolve)
- `"stack"` → `render_stack` (sequential composition: composites each photo onto accumulated PNG, renders each as a segment, then concatenates)

For "stack", a `stack_{render_id}/` work directory is created beside the output file and cleaned up after. Uses `run_ffmpeg_blocking()` (blocking, stderr-capturing) for intermediate steps.

All photo paths, the output path, work dir, and ffmpeg binary path are passed through `dunce::simplified()` before being given to FFmpeg to strip `\\?\` prefixes.

### Image import pipeline (src-tauri/src/image/)

`import_images` command (`commands/import.rs`) partitions paths into HEIC and processable in one pass, then offloads to `tauri::async_runtime::spawn_blocking` (keeps UI responsive).

`generate_thumbnails` (`image/thumbnail.rs`) runs across files in parallel via Rayon. Per file:
1. Compute deterministic thumb path (FNV-1a hash). **Return cached result immediately** if the file already exists on disk (`app_cache_dir/thumbnails/`) — only a header read for dims.
2. On cache miss: JPEG files use `jpeg-decoder` **shrink-on-load** — `Decoder::scale(w,h)` picks the smallest of {1/8,1/4,1/2,1} ≥ requested, so a 24MP JPEG is decoded at ~1/64 the pixel count. Non-JPEG (PNG/WEBP) falls back to `image::open`.
3. EXIF orientation (`image/exif.rs`) is applied to the **small decoded buffer**, not the full-res image.
4. Stored `width/height` = original (unscaled, oriented) dimensions. For orientations 5–8, `w` and `h` are swapped before returning.

HEIC detection and conversion (`image/heic.rs`): ffmpeg converts HEIC → JPEG in parallel (Rayon `par_iter`). Converted files then go through the normal thumbnail path. `libvips`/`turbojpeg` were considered but rejected — both require C/NASM toolchain additions that conflict with the existing fragile mingw setup.

### Audio engine (src/hooks/useAudioEngine.ts)

Web Audio API. `AudioContext` is created lazily. Uses `isPlayingRef` (mirrors `isPlaying` state) to avoid stale-closure bugs in `seek`, `currentTime`, and `pause` callbacks. Before every `.stop()` call, `source.onended` is set to `null` to prevent the ended handler from firing after a manual stop.

### Project persistence (src/lib/projectPersistence.ts)

`saveProject` / `loadProject` via `@tauri-apps/plugin-fs` + `@tauri-apps/plugin-dialog`. Validates `schemaVersion === 1` on load. Autosave triggers 1 second after any project change (debounced effect in `App.tsx`).

### Filmstrip (src/components/Filmstrip/)

`Filmstrip.tsx` renders the horizontal strip of photos with DnD reorder (`@dnd-kit`). Strip height is user-resizable via a drag handle at the bottom (70–320px). Each `FilmstripCell` shows a hover-revealed × button to remove that photo individually; a "Clear all" button appears top-right when the strip is non-empty. Cell width is derived from height at 4:3.

### ExportPanel (src/components/ExportPanel/)

Invokes `render_video` with a config object including: `photos` (path + frameCount), `bpm`, `firstBeatOffsetMs`, `transition`, `cropRatio`, `scaleMode`, `width/height` (from resolution), `fps`, `totalDurationS`, `outputPath`, `songPath`, `renderId` (nanoid). After success, calls `revealItemInDir` on the output file.

## Key Invariants

- `beatsPerPhoto` is stored as `beats / photos` ratio. The UI shows "X photos per Y beats" — `beatsPerPhoto = Y / X`.
- Frame counts: `Math.round(startTime * fps)` to `Math.round(endTime * fps)`, min 1 frame.
- Crop dimensions are height-anchored: output height = render height, width = `height * ratio`, clamped to render width. **Both W and H must be even** — `yuv420p` and H.264 require it. `crop_dimensions()` floors to even via `(n/2)*2`.
- `totalDurationS` passed to `render_video` = **pure photo play duration only** (sum of all per-photo beat durations). It must NOT include `firstBeatOffsetMs`. The audio offset is handled separately by `-ss <offsetSecs>` on the audio input. Including the offset in `totalDurationS` causes audio to overrun the video by `offsetSecs`.
- The preview canvas redraws on `[activeIndex, photos, cropRatio, scaleMode, globalTransition, canvasW, canvasH]` changes.
- `globalTransition = "stack"` in the preview skips `clearRect` so photos accumulate visually.
- `render_stack` writes intermediate PNGs via `run_ffmpeg_blocking`. PNG commands must specify `-pix_fmt rgb24` — `yuv420p` filter output is not supported by the PNG encoder directly.

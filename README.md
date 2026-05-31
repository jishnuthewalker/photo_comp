# PhotosCompilation

Desktop app that compiles a sequence of photos into a beat-synced MP4 video. Import photos, set BPM (manual, tap-tempo, or auto-detected), arrange them on a filmstrip, preview with audio, then export.

**Stack:** Tauri 2 · React 18 · TypeScript · Vite · Zustand (+ zundo undo/redo) · Rust · FFmpeg (bundled, BtbN GPL build) · Web Audio API · essentia.js (BPM detection) · jpeg-decoder (shrink-on-load thumbnails)

---

## Prerequisites (Windows)

1. **Node.js** 18+
2. **Rust** (stable) — `rustup` installs the GNU toolchain automatically via `rust-toolchain.toml`
3. **WinLibs MinGW64** — needed for the GNU linker. Install via WinGet:
   ```
   winget install WinLibs.WinLibs.UCRT.POSIX
   ```
   Then create a junction so Cargo finds it:
   ```
   mklink /J C:\mingw64 "C:\path\to\winlibs"
   ```
4. **FFmpeg binary** — place the BtbN GPL static build at:
   ```
   src-tauri/binaries/ffmpeg-x86_64-pc-windows-gnu.exe
   ```
   Dev mode also needs a copy (or hard link) at:
   ```
   src-tauri/target/x86_64-pc-windows-gnu/debug/binaries/ffmpeg-x86_64-pc-windows-gnu.exe
   ```

---

## Commands

```bash
# Install JS dependencies
npm install

# Dev (Tauri window + Vite HMR)
npm run tauri dev

# Frontend only (Vite at localhost:1420)
npm run dev

# Production build
npm run build

# Rust only (faster backend iteration)
cd src-tauri && cargo build --target x86_64-pc-windows-gnu

# TypeScript check only
npx tsc --noEmit

# Tests
npm test
```

---

## Project layout

```
src/                    React + TypeScript frontend
  components/           UI components (Filmstrip, PreviewCanvas, ExportPanel, …)
  hooks/                useAudioEngine, usePreviewSync
  lib/                  cumulativeTimeline, bpmDetector, projectPersistence, tapTempo
  store/                Zustand project store + types
src-tauri/src/          Rust backend (Tauri commands)
  commands/             import_images, render_video, cancel_render, check_disk_space
  ffmpeg/               FFmpeg binary resolution, render pipeline (chunked + transitions)
  image/                Thumbnail generation, EXIF rotation, HEIC conversion
src-tauri/binaries/     Bundled FFmpeg executable
docs/                   Design spec and implementation plan
```

See `CLAUDE.md` for architectural details, key invariants, and build notes.

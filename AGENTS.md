# AGENTS.md

Use this file as the quick-start guide for coding agents. Read `CLAUDE.md` before making broad changes; it contains the detailed architecture, invariants, and build notes.

## Project

**Framecut** (repository name: PhotosCompilation) is documented as a web-first photo-to-video editor. The browser/Vite app is the primary runtime; the native Tauri wrapper remains available as a legacy path for desktop-specific checks and FFmpeg-backed export work.

- Frontend: React 18, TypeScript, Zustand, zundo, Vite
- Legacy desktop wrapper: Rust, Tauri 2
- Video rendering: bundled FFmpeg sidecar for the legacy wrapper

## Verify Changes

```bash
# Frontend type check and production bundle
npm run build

# Frontend tests
npx vitest run

# Legacy Rust backend
cd src-tauri
cargo build --target x86_64-pc-windows-gnu
```

Run `git diff --check` before handing work back.

## Windows Build Constraint

Do not change the Rust target or linker setup casually. The legacy wrapper intentionally builds `x86_64-pc-windows-gnu` through the linker configured in `.cargo/config.toml`.

The Tauri library crate must remain `["staticlib", "rlib"]`. Do **not** add `cdylib`; GNU ld overflows the DLL-export ordinal limit.

The FFmpeg sidecar path and `dunce::simplified()` path normalization are also intentional. Read `CLAUDE.md` before changing backend build or render code.

## Frontend Rules

- Use the CSS tokens and utility classes in `src/style.css`; do not scatter new hardcoded colors through components.
- Keep light mode as the default. Dark mode is selected through `data-theme="dark"` and persisted as `framecut-theme`.
- Selection UI state lives outside the persisted `project` object and outside undo history.
- Preserve native photo drop review: `App.tsx` listens with `getCurrentWebview().onDragDropEvent()`, then routes dropped paths through `PhotoGrid`.
- Each native drop must remount a fresh review modal so earlier photos and selections do not linger. The modal picker may append intentionally.
- Dropped photos must open the review modal and remain preselected. Do not add them directly to the filmstrip.
- Reuse the Rust `import_images` command for dialog imports and file drops.
- Keep duplicate hashing opt-in through `analyze_duplicates`. Preserve separate path-duplicate and content-duplicate removal actions.
- For BPM detection, import `essentia.js/dist/essentia.js-core.es.js` and `essentia.js/dist/essentia-wasm.es.js` directly. Do not import the `essentia.js` package root in frontend code; its UMD entrypoint can produce a non-constructible `EssentiaWASM.EssentiaJS` browser export.

## Important Files

- `src/App.tsx`: shell, theme persistence, native file-drop listener
- `src/style.css`: design tokens and shared UI classes
- `src/store/projectStore.ts`: persisted project state, selection state, undo/redo
- `src/components/Filmstrip/`: filmstrip selection, context menu, multi-drag reorder
- `src/components/PhotoGrid/PhotoGrid.tsx`: import review modal
- `src/lib/photoImport.ts`: pure imported-photo merge helper
- `src-tauri/src/commands/import.rs`: image import, HEIC conversion, and opt-in duplicate analysis
- `src/lib/bpmDetector.ts`: browser-safe Essentia BPM detection wrapper
- `src/test/bpmDetector.test.ts`: BPM browser-entrypoint regression coverage
- `src-tauri/src/ffmpeg/`: legacy render pipeline

## Render Invariants

- `beatsPerPhoto` stores beats divided by photos.
- `totalDurationS` excludes `firstBeatOffsetMs`.
- H.264 crop width and height must both be even.
- Stack-transition PNG intermediates require `-pix_fmt rgb24`.

# Framecut Web Port

Framecut is documented as a web-first photo-to-video editor.

## Current runtime split

- **Primary runtime:** browser/Vite app
- **Legacy runtime:** native Tauri wrapper for desktop-specific checks and FFmpeg-backed export work

The browser app is the default place to run and validate UI changes. The native wrapper remains available when you need the Rust/FFmpeg pipeline or Windows-specific behavior.

## How to run

### Web

```bash
npm run dev
```

### Legacy desktop wrapper

```bash
npm run tauri dev
```

## What the web runtime uses

- React 18, TypeScript, Zustand, zundo, Vite
- Web Audio API for playback and beat sync
- browser file APIs for the primary development loop
- the same shared UI tokens and components that the desktop wrapper uses

## What the legacy wrapper still provides

- Rust-backed FFmpeg export
- Windows linker and sidecar validation
- desktop drag-and-drop and filesystem behavior checks

## Notes

- The browser runtime is the default path for future work.
- Treat the Tauri app as legacy when writing docs or instructions.
- Keep the FFmpeg and Windows build notes in `CLAUDE.md` because they still matter for the legacy wrapper.

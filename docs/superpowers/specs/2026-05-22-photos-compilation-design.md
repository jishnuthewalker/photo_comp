# PhotosCompilation — Design Spec
**Date:** 2026-05-22
**Status:** Approved
**Schema version:** 1

---

## What It Does

Desktop app that compiles a sequence of photos into a video where each photo appears in sync with the beat of a song. User imports photos, sets BPM (manually, tap-tempo, or auto-detected from song), arranges and crops photos, previews with audio, then exports.

---

## Platform & Stack

| Layer | Choice | Reason |
|---|---|---|
| Desktop shell | Tauri 2.x | ~15MB output, Rust backend, WebView2, cross-platform |
| Frontend | React + Vite + TypeScript | Fast HMR, large ecosystem |
| State | Zustand + zundo middleware | Simple state + undo/redo |
| Drag/drop | @dnd-kit/sortable | Filmstrip reorder |
| Virtual scroll | react-window | 5000+ photos in import grid |
| Video encode | FFmpeg (bundled, BtbN GPL build) | libx264 (v1); prores_ks/zoompan in same build for post-v1 |
| Thumbnails | Rust: image crate + rayon | Parallel, EXIF-corrected |
| EXIF rotation | Rust: kamadak-exif | Auto-correct iPhone/camera orientation |
| BPM detection | essentia.js (WASM) | `RhythmExtractor2013` — actively maintained, accurate |
| Audio playback | Web Audio API (AudioContext) | `currentTime` as sync source of truth |

**WebView2 install strategy:** Tauri installer bootstraps WebView2 if absent (Win10 machines). Bundle size = ~15MB Tauri output + ~120MB WebView2 download on first run for Win10 users without Edge installed. Win11 ships WebView2 pre-installed.

**Future platforms:** macOS (same codebase, different build), Android (Tauri 2 mobile + ffmpeg-kit-android)

---

## UI Layout

```
┌──────────────────────────────────────────────────┐
│  [FILMSTRIP — horizontal, reorderable, scrollable]│
│  [beat markers + playhead overlaid on cells]      │
├──────────────────────────────────────────────────┤
│                                                  │
│              [PREVIEW CANVAS]                    │
│              (thumbnails, ≤720p)                 │
│                                                  │
├──────────────────────────────────────────────────┤
│  [CONTROLS: BPM | offset | beats/photo | crop |  │
│   alignment | transition | format | resolution]  │
│  [EXPORT button]                                 │
└──────────────────────────────────────────────────┘
```

Beat markers live on the filmstrip — no separate timeline row. Each filmstrip cell shows photo thumb + beat count badge. Playhead moves across filmstrip during preview.

**PhotoGrid** is an import-step panel (modal or slide-in drawer only). On import, selected photos are appended to filmstrip in filename order. PhotoGrid is dismissed after import — all reordering happens in the filmstrip.

**Seeking in preview:** clicking a filmstrip cell stops AudioContext source, creates new source starting at `cumulativeStartTimes[idx]`, resumes playback from that offset.

---

## Data Model

```ts
interface Project {
  schemaVersion: 1
  id: string
  name: string
  photos: Photo[]
  bpm: number
  firstBeatOffsetMs: number  // ms into song where beat 1 lands
  beatsPerPhoto: number      // global default; floats allowed (e.g. 0.5 for fast cuts)
  cropRatio: AspectRatio
  alignment: Alignment
  globalTransition: Transition
  song?: AudioFile
  outputConfig: OutputConfig
  lastModified: number
}

interface Photo {
  id: string
  originalPath: string
  thumbPath: string
  beatsOverride?: number     // undefined = use project.beatsPerPhoto
}

interface AudioFile {
  path: string
  durationMs: number
}

interface OutputConfig {
  format: "mp4"              // ProRes post-v1
  resolution: "720p" | "1080p" | "4k"  // custom post-v1
  fps: 24 | 30 | 60
}

type AspectRatio = "16:9" | "9:16" | "1:1" | "4:3"
type Alignment = "center" | "top" | "bottom" | "left" | "right"
type Transition = "cut" | "crossfade" | "stack"  // stack = sequential photo compositing
```

---

## Core Modules

### Frontend

| Module | Responsibility |
|---|---|
| `PhotoGrid` | Import-step modal: virtualized 2-column grid (react-window), multi-select, confirm → append to filmstrip |
| `Filmstrip` | Horizontal sequence, @dnd-kit/sortable, beat count badge per cell, playhead overlay, click-to-seek |
| `PreviewCanvas` | Canvas + rAF loop. Reads `audioContext.currentTime`. Binary-searches `cumulativeStartTimes[]`. Redraws only on idx change — never on every frame unconditionally. |
| `BpmControls` | Manual input, tap-tempo (median of last 8 intervals), auto-detect trigger, first-beat offset slider |
| `ControlsPanel` | Crop ratio, alignment, beats/photo, transition type |
| `ExportPanel` | Format, resolution, fps, render button, progress bar, cancel, reveal-in-explorer |
| `AudioEngine` | AudioContext wrapper, loads/decodes song, play/pause/seek |
| `BpmDetector` | essentia.js wrapper — `detect(audioBuffer): Promise<{ bpm: number; beats: number[] }>` |
| `ProjectStore` | Zustand + zundo. Undo commits on `pointerup` / action-complete only (not on every slider tick). Autosave debounced 1s. Resume = empty undo history. |

### Rust Backend (Tauri Commands)

| Command | Input | Output |
|---|---|---|
| `import_images` | `paths: string[], thumb_size: u32` | `PhotoMeta[]` — generates thumbs inline (rayon), EXIF-corrects, detects HEIC paths, returns list of HEIC paths needing conversion |
| `render_video` | `RenderConfig` | streams `RenderProgress` events, returns output path |
| `cancel_render` | `render_id: string` | kills FFmpeg child, nukes render workdir |
| `check_disk_space` | `path: string, required_bytes: u64` | `bool` |

`import_images` handles both metadata + thumbnail generation in one call. HEIC detection is part of the return value — no separate command.

---

## BPM Detection Flow

1. User imports song (MP3, AAC, WAV, FLAC)
2. AudioContext decodes to `AudioBuffer`
3. `BpmDetector.detect(buffer)` runs essentia.js `RhythmExtractor2013` → `{ bpm, beats[] }`
4. Detected BPM + beat timestamps displayed on filmstrip
5. User can: accept, type manual BPM override, tap-tempo (median of last 8 tap intervals), drag offset slider
6. Beat positions recompute on any change

**Swappable interface** — Rust aubio-rs or Python/librosa can replace essentia.js later:
```ts
interface IBpmDetector {
  detect(buffer: AudioBuffer): Promise<{ bpm: number; beats: number[] }>
}
```

---

## Preview System

```ts
// Recompute whenever photos, BPM, beatsPerPhoto, or firstBeatOffsetMs change
function buildCumulativeTimeline(photos: Photo[], bpm: number, beatsPerPhoto: number, firstBeatOffsetMs: number): number[] {
  const beatDuration = 60 / bpm
  const times: number[] = []
  let t = firstBeatOffsetMs / 1000
  for (const photo of photos) {
    times.push(t)
    t += beatDuration * (photo.beatsOverride ?? beatsPerPhoto)
  }
  return times  // cumulativeStartTimes[i] = seconds when photo i starts
}

// rAF loop — AudioContext.currentTime is source of truth
function onFrame() {
  const t = audioContext.currentTime
  const idx = binarySearchLE(cumulativeStartTimes, t)
  if (idx !== currentIdx) {  // only redraw on photo change
    currentIdx = idx
    drawPhoto(thumbnails[idx])
    updateFilmstripPlayhead(idx)
  }
  requestAnimationFrame(onFrame)
}
```

Canvas renders thumbnails at ≤720p. No FFmpeg in preview.

---

## Render Pipeline

### Frame-accurate timing (fixes rounding drift)

**Do not use `-t <duration>` per photo.** Floating-point duration × fps rounds per photo, accumulating drift. Instead: compute integer frame counts from cumulative timeline.

```ts
function buildFrameCounts(photos, bpm, beatsPerPhoto, firstBeatOffsetMs, fps): number[] {
  const times = buildCumulativeTimeline(photos, bpm, beatsPerPhoto, firstBeatOffsetMs)
  return photos.map((_, i) => {
    const start = Math.round(times[i] * fps)
    const end = i + 1 < photos.length
      ? Math.round(times[i + 1] * fps)
      : Math.round((times[i] + (60 / bpm) * (photos[i].beatsOverride ?? beatsPerPhoto)) * fps)
    return end - start  // integer frame count, no drift
  })
}
```

Each photo gets `-vframes <frameCount>` instead of `-t <duration>`. This ensures frame counts sum exactly to total frames and audio sync is preserved across all 2000 photos.

### Chunked architecture (avoids Windows cmd line limit ~32K chars)

```
photos[] + frameCounts[]
  → split into chunks of 50
  → each chunk → intermediate chunk_N.mp4 (CFR, constant framerate)
  → concat all intermediates (stream copy, no re-encode)
  → mux audio
  → final output.mp4
```

Render workdir: `%TEMP%/photocomp-<render_id>/` — nuked entirely on cancel, crash cleanup, or success.

### Per-chunk FFmpeg (hard cut mode):
```bash
ffmpeg -y \
  -loop 1 -vframes <n0> -r <fps> -i <photo0> \
  -loop 1 -vframes <n1> -r <fps> -i <photo1> \
  ... \
  -filter_complex "[0:v]scale=W:H:force_original_aspect_ratio=increase,crop=W:H,setsar=1,format=yuv420p[v0];
                   [1:v]scale=W:H:force_original_aspect_ratio=increase,crop=W:H,setsar=1,format=yuv420p[v1];
                   [v0][v1]concat=n=2:v=1:a=0[out]" \
  -map "[out]" -r <fps> -c:v libx264 -pix_fmt yuv420p \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  chunk_N.mp4
```

### Crossfade mode — chunk boundary handling:
Chunks overlap by 1 photo: chunk N uses photos `[N*50 .. N*50+50]` (51 inputs, 50 transitions including boundary). This ensures xfade covers every transition. Each chunk intermediate duration accounts for xfade overlap. Concat intermediates with correct offset timestamps.

If overlap implementation proves too complex for v1: document that crossfade mode has hard cuts every 50 photos (chunk boundaries) and ship with that limitation disclosed.

### Final concat + audio mux:
```bash
# concat_list.txt: one "file chunk_N.mp4" per line
ffmpeg -y \
  -f concat -safe 0 -i concat_list.txt \
  -ss <firstBeatOffsetMs/1000> -i song.mp3 \
  -c:v copy -c:a aac \
  -t <total_video_duration> \
  output.mp4
```

**Audio handling (v1):** `-ss <firstBeatOffsetMs/1000>` seeks song to first beat offset. `-t <totalDurationS>` clips to video duration. **`totalDurationS` must be the pure photo play duration — do NOT include `firstBeatOffsetMs`**. The offset is already handled by `-ss`; including it in `-t` causes audio to overrun the video by `offsetSecs`. **No looping in v1** — if song ends before video, audio goes silent for remainder. Loop support post-v1.

### FFmpeg startup check:
Verify `libx264` in encoders, `xfade` + `concat` in filters. Show modal on failure.

### Progress:
```ts
{ type: "progress", chunkIndex: number, totalChunks: number, framesEncoded: number }
```
Streamed via Tauri emit from Rust.

### Disk space estimate:
`required_bytes = (bitrate_bps / 8) × duration_s × 2.5`
where `bitrate_bps` = 8_000_000 for 1080p30, 4_000_000 for 720p, 20_000_000 for 4K.
2.5× safety factor covers intermediate chunks. Check before render starts.

---

## Import Flow

1. User opens file picker (photos or folder)
2. `import_images` called — generates thumbnails in parallel (rayon), EXIF-corrects, returns `PhotoMeta[]` + list of detected HEIC paths
3. If HEIC paths non-empty: frontend shows "X photos are HEIC format. Convert to JPEG for compatibility?" — on confirm, `import_images` called again on converted paths (FFmpeg `-i input.heic output.jpg` per file)
4. Photos appended to filmstrip in filename order

---

## Project Persistence

- Saved as `project.json` in user-chosen folder
- Autosave: debounced 1s, triggers on state change. Commits only after action completes (not mid-slider-drag).
- On launch: offer to resume last project (empty undo history on resume — acceptable)
- Autosave fires before any render command starts

---

## Undo/Redo

zundo (Zustand middleware). Undo commits on discrete action completion: drag-end, input blur, button click. Not on every slider `onChange`.

Tracked: photo reorder, add/remove photos, BPM value, beat override, crop/alignment.
Not tracked: preview position, export progress.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| FFmpeg missing / bad encoders | Modal on launch, clear message |
| HEIC imported | Warning + auto-convert offer |
| Disk space insufficient | Pre-check with estimate formula, block export with size info |
| FFmpeg crash mid-render | Catch non-zero exit, surface stderr snippet |
| Render cancelled | Kill child process, delete entire render workdir |
| Photo file moved/deleted | Placeholder + warning badge in filmstrip cell |
| Windows long paths >260 chars | `\\?\` prefix in all Rust file ops; copy to short temp path on import as fallback |
| WebView2 local thumbnail files | Tauri asset protocol — never base64-encode thumbnails |

---

## Deferred to Post-v1

- ProRes output format
- Custom WxH resolution
- Ken Burns (zoompan) transition
- Per-photo transition override UI
- macOS build + notarization
- Android (Tauri 2 mobile + ffmpeg-kit-android)
- BPM detector upgrade to Rust aubio-rs (if essentia.js accuracy insufficient)
- Waveform display in filmstrip
- Audio looping when song shorter than video
- Multiple songs / chapters

---

## Implementation Order

1. Tauri 2 shell + FFmpeg bundle + capabilities ACL + hard-cut render of 10 photos → prove pipeline
2. Import + EXIF rotation + HEIC conversion + PhotoGrid modal
3. Filmstrip with @dnd-kit reorder + project save/load + undo/redo — get rock solid
4. Manual BPM + tap-tempo + first-beat offset + hard-cut render with audio mux → **render 2000 photos, measure A/V drift at end. Must be <1 frame.**
5. Preview canvas with cumulative-time lookup + AudioContext playback + seek
6. essentia.js BPM auto-detect
7. Crossfade transition (chunked overlap render)
8. Export polish: disk space check, cancel + workdir cleanup, reveal-in-explorer, color tagging

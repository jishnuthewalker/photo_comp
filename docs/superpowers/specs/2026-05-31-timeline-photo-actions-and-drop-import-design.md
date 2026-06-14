# Timeline Photo Actions and Drop Import Design

> Historical note: this spec reflects the desktop-first era of Framecut. Current repo docs treat the browser/Vite app as primary and the native Tauri wrapper as legacy.

## Goal

Keep the import review modal for native file drops, prevent a dropped batch from being imported twice, and make filename sorting and duplicate analysis available after photos have been added to the timeline.

## Scope

The import modal remains the review step for both dialog-selected files and native drag-and-drop files. Existing import-modal actions remain available.

The timeline gains `Arrange by filename` and `Analyze duplicates` in both places where selected-photo actions are exposed:

- the visible selection toolbar above the timeline
- the right-click context menu for a selected timeline photo

Timeline actions operate only on the selected photos.

## Drag-And-Drop Review

Each native `drop` event creates a fresh import-review session. The review modal remounts for that session, imports the dropped paths once, and preselects the imported photos.

The modal must not re-import the same `initialPaths` merely because the parent re-rendered or supplied an equivalent array reference. The modal picker may still append additional photos intentionally during the active review session.

Example: dropping 24 paths opens a fresh review modal containing 24 preselected photos, not 48.

## Timeline Arrange By Filename

`Arrange by filename` sorts only the selected timeline photos by basename, case-insensitively. Their original timeline slots remain the same; unselected photos do not move.

Example:

```text
Before: [unselected-z, selected-c, unselected-a, selected-b]
After:  [unselected-z, selected-b, unselected-a, selected-c]
```

The reorder is a persisted project change and participates in the existing undo history.

## Timeline Analyze Duplicates

`Analyze duplicates` hashes only the selected timeline photos by invoking the existing Rust `analyze_duplicates` command with their original paths. Normal timeline selection and import remain hash-free.

Duplicate results remain split into:

- path duplicates: normalized paths match
- content duplicates: SHA-256 hashes match

The UI reports duplicate matches within the analyzed selection. It preserves the existing separate removal actions for path duplicates and content duplicates. Removing duplicates is a persisted project change and participates in undo history.

Analysis results are transient UI state. They do not become part of the persisted project model or undo history.

## Components

### `src/App.tsx`

Continue listening for native Tauri drag-drop events. Create a new review session for each drop and pass stable session input to `PhotoGrid`.

### `src/components/PhotoGrid/PhotoGrid.tsx`

Keep import-modal sorting and duplicate analysis. Import native dropped paths once when the newly mounted review session starts. Keep picker-based appends intentional.

### `src/components/Filmstrip/Filmstrip.tsx`

Own transient timeline duplicate-analysis state and coordinate timeline actions. Pass the actions and current duplicate-review information to the visible selection toolbar and context menu.

### `src/components/Filmstrip/SelectionToolbar.tsx`

Expose timeline `Arrange by filename` and `Analyze duplicates` actions whenever photos are selected.

### `src/components/Filmstrip/CellContextMenu.tsx`

Expose the same actions in the right-click menu. Preserve existing beats and remove actions.

### `src/store/projectStore.ts`

Add store actions for sorting selected photos within their existing slots and removing selected timeline duplicates after transient analysis identifies their IDs.

### `src/lib/photoImport.ts`

Keep pure helpers for import review. Add or adjust pure helpers where needed so dropped-session handling and selected-slot sorting can be regression-tested without rendering Tauri UI.

## Error Handling

If timeline duplicate analysis fails, preserve the existing timeline order and selection. Show the error near the timeline actions and allow retry.

If dropped-path import fails, keep the review modal open and show the existing import error.

## Testing

Add focused tests before production changes:

- a dropped review session consumes its initial batch once
- dropping 24 paths cannot append the same 24 paths a second time through a parent re-render
- selected-slot filename sorting leaves unselected timeline photos in place
- selected-slot filename sorting is case-insensitive by basename
- duplicate analysis requests only selected timeline paths
- path-duplicate and content-duplicate removal remain separate

Run:

```bash
npx vitest run
npm run build
git diff --check
```

Rust changes are not expected because the existing `analyze_duplicates` command is reused.

## Local Review Notes

The design intentionally does not deduplicate dropped paths automatically. Repeated photos can be intentional timeline content, and automatic filtering would change existing semantics.

The design intentionally keeps analysis opt-in and transient. Persisting content hashes would expand the project schema and undo surface without helping the requested workflow.

# Import Duplicate Review Design

## Goal

Keep drag-and-drop review sessions isolated, allow users to arrange imported photos by filename, and provide opt-in duplicate analysis without slowing normal imports.

## Behavior

- Every native file drop starts a fresh import review session. Existing modal photos and selections do not carry into the new drop.
- The modal's own file picker continues to append photos to the current review session.
- `Arrange by filename` sorts the review list case-insensitively by basename only.
- `Analyze duplicates` is explicit. Normal import does not hash file content.
- Duplicate analysis reports path duplicates and content duplicates separately.
- Selecting a photo exposes separate actions:
  - `Remove other path duplicates`
  - `Remove other content duplicates`
- Removing duplicates keeps the selected reference photo and removes only its matching siblings.
- Appending new files after analysis clears stale analysis metadata until analysis runs again.

## Architecture

Add a Rust `analyze_duplicates` Tauri command. It accepts the current review paths, canonicalizes each path for path-duplicate comparison, hashes file bytes with SHA-256 for content comparison, and runs in `tauri::async_runtime::spawn_blocking`.

The frontend stores optional duplicate metadata alongside each imported photo. Pure helpers in `src/lib/photoImport.ts` handle filename sorting, duplicate counting, and removing matching siblings. `PhotoGrid.tsx` invokes the analysis command and renders the review controls. `App.tsx` increments a review-session key on every native drop so React remounts `PhotoGrid`.

## Error Handling

If duplicate analysis fails, the modal keeps the imported photos and selection unchanged and shows the existing import error notice. Import remains usable without analysis.

## Testing

- Unit-test pure filename sorting and separate duplicate-removal behavior.
- Unit-test fresh native-drop review session creation.
- Add Rust unit tests for duplicate analysis using temporary files.
- Run frontend tests, TypeScript build, Rust tests, production build, and `git diff --check`.

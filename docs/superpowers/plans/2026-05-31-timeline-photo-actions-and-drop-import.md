# Timeline Photo Actions and Drop Import Implementation Plan

> Historical note: this plan reflects the desktop-first era of Framecut. Current repo docs treat the browser/Vite app as primary and the native Tauri wrapper as legacy.

> **For agentic workers:** REQUIRED: Use `superpowers:test-driven-development` while implementing this plan. Track steps with checkboxes. Do not change backend render code or Rust build configuration.

**Goal:** Fix native drag-and-drop review so one dropped batch is imported once, and expose selected-photo filename sorting and duplicate analysis in both timeline action menus while keeping the existing import-modal actions.

**Architecture:** Preserve the existing Tauri `import_images` and `analyze_duplicates` commands. Keep import-review behavior in `PhotoGrid`, persisted timeline mutations in the Zustand store, and transient timeline duplicate-analysis state in the filmstrip UI. Add pure helpers for behaviors that need deterministic regression coverage.

**Tech Stack:** React 18, TypeScript, Zustand, zundo, Vitest, Tauri 2 `invoke`

**Approved design:** `docs/superpowers/specs/2026-05-31-timeline-photo-actions-and-drop-import-design.md`

---

## Required Behavior

- Native drag-and-drop still opens a fresh review modal.
- Dropped photos remain preselected.
- Dropping 24 photos shows 24 photos, not 48.
- The modal picker may append additional photos intentionally.
- Keep `Arrange by filename` and `Analyze duplicates` in the import modal.
- Add both actions to the visible timeline selection toolbar and the timeline right-click menu.
- Timeline filename sorting affects only selected photos and keeps their existing slots.
- Timeline duplicate analysis invokes the existing Rust command with only selected timeline paths.
- Timeline duplicate analysis remains opt-in and transient.
- Path duplicates and content duplicates remain separate concepts and removal actions.
- Timeline mutations participate in existing undo history.

## Likely Root Cause

`PhotoGrid` imports `initialPaths` in an effect:

```ts
useEffect(() => {
  void importPaths(initialPaths);
}, [initialPaths]);
```

React development behavior or a repeated effect execution can call the async import twice during one mounted review session. The parent already remounts `PhotoGrid` with `key={importSessionKey}` for a new native drop. Guard the initial import inside each modal mount so the dropped batch is consumed once. Do not deduplicate paths globally: repeated paths can be intentional user input.

## File Map

- Modify `src/components/PhotoGrid/PhotoGrid.tsx`
  - Consume native dropped `initialPaths` once per mounted review session.
  - Keep existing import-modal toolbar actions unchanged.
- Modify `src/lib/photoImport.ts`
  - Add pure selected-slot filename sorting helper for timeline photos.
  - Add pure helper for resolving analyzed selected-photo duplicates if useful.
- Modify `src/test/photoImport.test.ts`
  - Add regression tests for one-time dropped-session consumption and selected-slot sorting.
- Modify `src/store/projectStore.ts`
  - Add persisted timeline mutation actions for selected-slot sorting and duplicate removal.
- Modify `src/components/Filmstrip/Filmstrip.tsx`
  - Invoke transient duplicate analysis for selected timeline photos.
  - Wire toolbar and context-menu actions.
  - Show duplicate analysis status, errors, and separate removal controls.
- Modify `src/components/Filmstrip/SelectionToolbar.tsx`
  - Add visible timeline action buttons.
- Modify `src/components/Filmstrip/CellContextMenu.tsx`
  - Add the same timeline actions to the right-click menu.
- Modify `src/style.css`
  - Add timeline duplicate-review styles only if existing utility classes are insufficient.
- Consider creating `src/lib/timelinePhotoActions.ts`
  - Prefer this if timeline helper logic would make `photoImport.ts` misleadingly broad.
- Consider creating `src/test/timelinePhotoActions.test.ts`
  - Prefer this if `src/lib/timelinePhotoActions.ts` is created.

## Task 1: Reproduce and Fix Double Import of Dropped Paths

**Files:**
- Modify: `src/components/PhotoGrid/PhotoGrid.tsx`
- Modify: `src/lib/photoImport.ts`
- Test: `src/test/photoImport.test.ts`

- [ ] **Step 1: Add a failing pure regression test**

Add a helper that models one-time consumption of a dropped review session. The test must prove that an equivalent second attempt returns no paths:

```ts
describe("consumeDropReviewPaths", () => {
  it("consumes one dropped batch only once per modal mount", () => {
    const consumed = new Set<number>();

    expect(consumeDropReviewPaths(consumed, 4, ["a.jpg", "b.jpg"])).toEqual([
      "a.jpg",
      "b.jpg",
    ]);
    expect(consumeDropReviewPaths(consumed, 4, ["a.jpg", "b.jpg"])).toEqual([]);
  });
});
```

Use a helper shape that stays simple in the React component. If a `useRef(false)` guard is clearer than a session-key helper, test a small pure `consumeInitialPaths` helper instead.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run src/test/photoImport.test.ts
```

Expected: FAIL because the one-time consumption helper does not exist.

- [ ] **Step 3: Add the minimal helper**

Implement the smallest pure helper in `src/lib/photoImport.ts`. It must return dropped paths on first consumption and an empty list for a second consumption of the same mounted review session.

- [ ] **Step 4: Guard `PhotoGrid` initial import**

In `PhotoGrid`, use mount-local state such as `useRef(false)` to ensure `initialPaths` is passed to `importPaths` once for that mounted modal:

```ts
const initialPathsConsumed = useRef(false);

useEffect(() => {
  if (initialPathsConsumed.current) return;
  initialPathsConsumed.current = true;
  void importPaths(initialPaths);
}, [initialPaths]);
```

Keep picker-based `handleImport()` appends unchanged. Keep the `key={importSessionKey}` remount in `App.tsx`; each new native drop must get a fresh guard.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run src/test/photoImport.test.ts
```

Expected: PASS.

## Task 2: Add Pure Selected-Slot Filename Sorting

**Files:**
- Modify: `src/lib/photoImport.ts` or create `src/lib/timelinePhotoActions.ts`
- Test: `src/test/photoImport.test.ts` or create `src/test/timelinePhotoActions.test.ts`

- [ ] **Step 1: Add a failing selected-slot sorting test**

The helper must sort selected photos by basename while leaving unselected slots untouched:

```ts
it("sorts selected photos within their existing timeline slots", () => {
  const photos = [
    { id: "1", originalPath: "C:\\photos\\z.jpg", thumbPath: "1.jpg" },
    { id: "2", originalPath: "C:\\photos\\Charlie.jpg", thumbPath: "2.jpg" },
    { id: "3", originalPath: "C:\\photos\\a.jpg", thumbPath: "3.jpg" },
    { id: "4", originalPath: "C:\\photos\\bravo.jpg", thumbPath: "4.jpg" },
  ];

  expect(arrangeSelectedPhotosByFilename(photos, new Set(["2", "4"])).map((photo) => photo.id))
    .toEqual(["1", "4", "3", "2"]);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run src/test/photoImport.test.ts
```

Expected: FAIL because `arrangeSelectedPhotosByFilename` does not exist.

- [ ] **Step 3: Implement the pure helper**

Use basename-only, case-insensitive sorting. Replace only the photos at selected indexes:

```ts
export function arrangeSelectedPhotosByFilename<T extends { id: string; originalPath: string }>(
  photos: T[],
  selectedIds: Set<string>
) {
  const sortedSelected = photos
    .filter((photo) => selectedIds.has(photo.id))
    .sort((a, b) => filename(a.originalPath).localeCompare(
      filename(b.originalPath),
      undefined,
      { sensitivity: "base" }
    ));
  let nextSelectedIndex = 0;
  return photos.map((photo) =>
    selectedIds.has(photo.id) ? sortedSelected[nextSelectedIndex++] : photo
  );
}
```

Reuse the existing basename helper rather than introducing a second path parser.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run src/test/photoImport.test.ts
```

Expected: PASS.

## Task 3: Add Zustand Timeline Mutation Actions

**Files:**
- Modify: `src/store/projectStore.ts`
- Test: use the existing store test file if present; otherwise create `src/test/projectStore.test.ts`

- [ ] **Step 1: Inspect existing store actions and tests**

Preserve these invariants:

- selection stays outside `project`
- selection stays outside undo history
- project photo reorder/removal updates `lastModified` consistently with existing actions
- do not persist duplicate fingerprints

- [ ] **Step 2: Add a failing store test for selected sorting**

Seed four photos, select two, call the new action, and assert that only selected slots changed. Assert selection IDs are preserved.

- [ ] **Step 3: Run the focused test and verify RED**

Run the exact Vitest file added or updated.

Expected: FAIL because the store action does not exist.

- [ ] **Step 4: Implement selected-slot sorting action**

Add an action such as:

```ts
arrangeSelectedPhotosByFilename: () => void;
```

Read `selectedPhotoIds` from UI state, apply the pure helper to `project.photos`, and update project metadata using the same pattern as existing reorder actions.

- [ ] **Step 5: Add a failing store test for duplicate removal**

Test a new action such as:

```ts
removePhotos(ids: string[]): void;
```

Reuse the existing `removePhotos` action if it already satisfies this need. Do not add a duplicate-specific persisted action unless it removes real duplication from callers.

- [ ] **Step 6: Run focused store tests and verify GREEN**

Expected: PASS.

## Task 4: Add Timeline Duplicate Analysis State and Actions

**Files:**
- Modify: `src/components/Filmstrip/Filmstrip.tsx`
- Modify: `src/components/Filmstrip/SelectionToolbar.tsx`
- Modify: `src/components/Filmstrip/CellContextMenu.tsx`
- Modify: `src/style.css` if needed

- [ ] **Step 1: Define transient timeline analysis data**

Use the existing Rust response shape:

```ts
interface DuplicateFingerprint {
  normalizedPath: string;
  contentHash: string;
}
```

Keep fingerprints in `Filmstrip` local state keyed by selected photo ID. Do not add them to `project.photos`.

- [ ] **Step 2: Implement timeline analysis handler**

At click time, read selection live from the store. Preserve timeline order:

```ts
const selectedPhotos = photos.filter((photo) => selectedPhotoIds.has(photo.id));
const fingerprints = await invoke<DuplicateFingerprint[]>("analyze_duplicates", {
  paths: selectedPhotos.map((photo) => photo.originalPath),
});
```

Validate that returned count equals requested count. Store an error string on failure and allow retry. Clear or invalidate stale results when selection changes or affected photos are removed.

- [ ] **Step 3: Compute separate duplicate groups**

Report only matches inside the analyzed selection:

- normalized path match groups
- content hash match groups

Keep the concepts separate. A content duplicate may exist at a different path.

- [ ] **Step 4: Add separate removal handlers**

For each kind, keep the first selected occurrence in timeline order and remove later matching selected IDs through the existing `removePhotos(ids)` store action. Do not remove photos that were outside the analyzed selection.

- [ ] **Step 5: Wire the selection toolbar**

Update `SelectionToolbar` props and render:

```text
Arrange by filename
Analyze duplicates
```

Disable sorting when fewer than two photos are selected. Disable duplicate analysis while loading or when no photos are selected.

- [ ] **Step 6: Wire the right-click menu**

Update `CellContextMenu` props and add the same actions. Preserve:

- set beats
- reset beats
- remove
- outside-click dismissal
- Escape dismissal

Read selected IDs live at action time. Close the menu after dispatching an action unless the interaction needs to show an inline duplicate result.

- [ ] **Step 7: Render timeline duplicate review**

Render a compact review block near the timeline selection toolbar. Include:

```text
Path duplicates: N
Remove other path duplicates
Content duplicates: N
Remove other content duplicates
```

Use existing CSS tokens and utility classes. Do not hardcode new colors in components.

## Task 5: Verify Import Modal Behavior Is Preserved

**Files:**
- Inspect: `src/components/PhotoGrid/PhotoGrid.tsx`
- Test: `src/test/photoImport.test.ts`

- [ ] **Step 1: Confirm existing modal actions remain**

Do not remove:

```text
Choose photos / folder
Arrange by filename
Analyze duplicates
```

- [ ] **Step 2: Confirm appended picker files clear stale analysis**

The existing `clearDuplicateAnalysis()` behavior should remain. Run the regression test that covers it.

- [ ] **Step 3: Confirm separate import-modal duplicate removals remain**

Do not merge path and content duplicate removal actions.

## Task 6: Full Verification

- [ ] **Step 1: Run frontend tests**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 2: Run production build**

```bash
npm run build
```

Expected: TypeScript check and Vite production bundle PASS.

- [ ] **Step 3: Run whitespace validation**

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 4: Manually verify in the Tauri app**

Run:

```bash
npm run tauri dev
```

Verify:

1. Drop exactly 24 images.
2. Confirm the review modal opens with exactly 24 selected photos.
3. Cancel and drop a different batch.
4. Confirm the modal contains only the second batch.
5. Import photos, select a subset in the timeline, and arrange by filename.
6. Confirm unselected timeline slots do not move.
7. Analyze duplicates from the toolbar and context menu.
8. Confirm only selected timeline photos are analyzed.
9. Remove path duplicates and content duplicates independently.
10. Confirm undo restores timeline mutations.

## Constraints

- Do not bypass the review modal for native drops.
- Do not deduplicate dropped paths automatically.
- Do not hash content during normal import.
- Do not persist duplicate fingerprints.
- Do not alter Rust target, linker, crate types, FFmpeg sidecar paths, or render code.
- Reuse `analyze_duplicates`; Rust changes should not be necessary.

## Handoff Notes

The repository may contain user changes. Inspect `git status --short --branch` before editing and do not revert unrelated work.

The local shell intermittently returned `windows sandbox: spawn setup refresh` while this plan was prepared. Retry read-only commands if that environment issue appears.

# Duplicate Photos Implementation Plan

> Historical note: this plan reflects the desktop-first era of Framecut. Current repo docs treat the browser/Vite app as primary and the native Tauri wrapper as legacy.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users duplicate selected filmstrip photos (inserted immediately after the rightmost selected photo), with the new copies auto-selected and Ctrl+D as a keyboard shortcut.

**Architecture:** Add `duplicatePhotos(ids)` to the Zustand store — finds rightmost selected index, splices copies (new nanoid IDs) in after it, updates selection to the new IDs. Expose in the right-click context menu and via a `window` keydown listener in `Filmstrip.tsx`.

**Tech Stack:** React, TypeScript, Zustand (zundo temporal), nanoid, Vitest

---

## File Map

| File | Change |
|---|---|
| `src/store/projectStore.ts` | Add `duplicatePhotos` to `ProjectState` interface + implementation |
| `src/components/Filmstrip/CellContextMenu.tsx` | Add "Duplicate" menu item |
| `src/components/Filmstrip/Filmstrip.tsx` | Add Ctrl+D keydown listener |
| `src/test/projectStore.test.ts` | New — unit tests for `duplicatePhotos` |

---

### Task 1: `duplicatePhotos` store action

**Files:**
- Modify: `src/store/projectStore.ts`
- Create: `src/test/projectStore.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/test/projectStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { useProjectStore } from "../store/projectStore";
import type { Photo } from "../store/types";

function makePhoto(id: string, overrides?: Partial<Photo>): Photo {
  return {
    id,
    path: `/photos/${id}.jpg`,
    originalPath: `/photos/${id}.jpg`,
    thumbnailPath: `/thumbs/${id}.jpg`,
    width: 1920,
    height: 1080,
    ...overrides,
  };
}

function resetStore(photos: Photo[] = [], selectedIds: string[] = []) {
  useProjectStore.setState({
    project: {
      schemaVersion: 1,
      id: "test",
      name: "Test",
      photos,
      bpm: 120,
      firstBeatOffsetMs: 0,
      beatsPerPhoto: 1,
      cropRatio: "16:9",
      alignment: "center",
      scaleMode: "cover",
      globalTransition: "cut",
      outputConfig: { format: "mp4", resolution: "1080p", fps: 30 },
      lastModified: 0,
    },
    selectedPhotoIds: new Set(selectedIds),
    selectionAnchorId: selectedIds[selectedIds.length - 1] ?? null,
  });
}

describe("duplicatePhotos", () => {
  beforeEach(() => resetStore());

  it("inserts copies after the rightmost selected photo", () => {
    const a = makePhoto("a");
    const b = makePhoto("b");
    const c = makePhoto("c");
    resetStore([a, b, c], ["a", "b"]);

    useProjectStore.getState().duplicatePhotos(["a", "b"]);

    const photos = useProjectStore.getState().project.photos;
    // Original order preserved: a, b, then copies of a+b, then c
    expect(photos).toHaveLength(5);
    expect(photos[0].id).toBe("a");
    expect(photos[1].id).toBe("b");
    // copies are at index 2 and 3 — same path as originals
    expect(photos[2].path).toBe(a.path);
    expect(photos[3].path).toBe(b.path);
    // original c is last
    expect(photos[4].id).toBe("c");
    // copy IDs differ from originals
    expect(photos[2].id).not.toBe("a");
    expect(photos[3].id).not.toBe("b");
  });

  it("preserves beatsOverride on copies", () => {
    const a = makePhoto("a", { beatsOverride: 2 });
    resetStore([a], ["a"]);

    useProjectStore.getState().duplicatePhotos(["a"]);

    const photos = useProjectStore.getState().project.photos;
    expect(photos[1].beatsOverride).toBe(2);
  });

  it("selects the new copies after duplicate", () => {
    const a = makePhoto("a");
    const b = makePhoto("b");
    resetStore([a, b], ["a"]);

    useProjectStore.getState().duplicatePhotos(["a"]);

    const { selectedPhotoIds, selectionAnchorId, project } = useProjectStore.getState();
    const copyId = project.photos[1].id;
    expect(selectedPhotoIds.has(copyId)).toBe(true);
    expect(selectedPhotoIds.has("a")).toBe(false);
    expect(selectionAnchorId).toBe(copyId);
  });

  it("does nothing when ids list is empty", () => {
    const a = makePhoto("a");
    resetStore([a], []);

    useProjectStore.getState().duplicatePhotos([]);

    expect(useProjectStore.getState().project.photos).toHaveLength(1);
  });

  it("handles single photo at end of strip", () => {
    const a = makePhoto("a");
    const b = makePhoto("b");
    resetStore([a, b], ["b"]);

    useProjectStore.getState().duplicatePhotos(["b"]);

    const photos = useProjectStore.getState().project.photos;
    expect(photos).toHaveLength(3);
    expect(photos[2].path).toBe(b.path);
    expect(photos[2].id).not.toBe("b");
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```
npx vitest run src/test/projectStore.test.ts
```

Expected: FAIL — `duplicatePhotos is not a function`

- [ ] **Step 3: Add `duplicatePhotos` to the `ProjectState` interface**

In `src/store/projectStore.ts`, add after `setPhotosBeatsOverride`:

```typescript
duplicatePhotos: (ids: string[]) => void;
```

Full updated interface block (the `// ── Photo actions ──` section):

```typescript
setPhotos: (photos: Photo[]) => void;
addPhotos: (photos: Photo[]) => void;
reorderPhotos: (fromIndex: number, toIndex: number) => void;
reorderPhotosMulti: (ids: string[], toIndex: number) => void;
removePhoto: (id: string) => void;
removePhotos: (ids: string[]) => void;
clearPhotos: () => void;
setPhotoBeatsOverride: (id: string, beats: number | undefined) => void;
setPhotosBeatsOverride: (ids: string[], beats: number | undefined) => void;
duplicatePhotos: (ids: string[]) => void;
```

- [ ] **Step 4: Implement `duplicatePhotos` in the store**

In `src/store/projectStore.ts`, add after the `setPhotosBeatsOverride` implementation (before `// ── Project settings ──`):

```typescript
duplicatePhotos: (ids) =>
  set((s) => {
    if (ids.length === 0) return {};
    const idSet = new Set(ids);
    const photos = s.project.photos;
    const rightmostIndex = photos.reduce(
      (max, p, i) => (idSet.has(p.id) ? Math.max(max, i) : max),
      -1
    );
    if (rightmostIndex === -1) return {};

    const copies = photos
      .filter((p) => idSet.has(p.id))
      .map((p) => ({ ...p, id: nanoid() }));

    const next = [...photos];
    next.splice(rightmostIndex + 1, 0, ...copies);

    const newIds = copies.map((c) => c.id);
    return {
      project: touch({ ...s.project, photos: next }),
      selectedPhotoIds: new Set(newIds),
      selectionAnchorId: newIds[newIds.length - 1] ?? null,
    };
  }),
```

- [ ] **Step 5: Run tests — verify they pass**

```
npx vitest run src/test/projectStore.test.ts
```

Expected: all 5 tests PASS

- [ ] **Step 6: Commit**

```
git add src/store/projectStore.ts src/test/projectStore.test.ts
git commit -m "feat(store): add duplicatePhotos action"
```

---

### Task 2: Context menu "Duplicate" item

**Files:**
- Modify: `src/components/Filmstrip/CellContextMenu.tsx`

- [ ] **Step 1: Add `duplicatePhotos` subscription and handler**

In `CellContextMenu.tsx`, after the existing `removePhotos` subscription (around line 21), add:

```typescript
const duplicatePhotos = useProjectStore((s) => s.duplicatePhotos);
```

Add handler after `handleRemove` (around line 97):

```typescript
const handleDuplicate = () => {
  duplicatePhotos(getSelectedIds());
  onClose();
};
```

- [ ] **Step 2: Add menu item**

In the JSX, add before the divider that precedes "Arrange by filename" (before the `<div className="menu-divider" />` at line ~141):

```tsx
<button className="menu-item" onClick={handleDuplicate}>
  Duplicate
</button>

<div className="menu-divider" />
```

The relevant section should look like:

```tsx
<button className="menu-item" onClick={handleResetBeats}>
  Reset beats
</button>

<div className="menu-divider" />

<button className="menu-item" onClick={handleDuplicate}>
  Duplicate
</button>

<div className="menu-divider" />

<button className="menu-item" onClick={() => { onArrangeByFilename(); onClose(); }}>
  Arrange by filename
</button>
```

- [ ] **Step 3: Manual smoke test**

Run `npm run tauri dev`, import 3+ photos, right-click one, click "Duplicate":
- A copy appears immediately to the right of the rightmost selected photo
- The copy is selected, original is deselected
- Undo (Ctrl+Z) removes the copy and restores prior selection anchor

- [ ] **Step 4: Commit**

```
git add src/components/Filmstrip/CellContextMenu.tsx
git commit -m "feat(filmstrip): add Duplicate item to cell context menu"
```

---

### Task 3: Ctrl+D keyboard shortcut

**Files:**
- Modify: `src/components/Filmstrip/Filmstrip.tsx`

- [ ] **Step 1: Subscribe to `duplicatePhotos` in Filmstrip**

In `Filmstrip.tsx`, add to the store subscriptions block (around line 43–54):

```typescript
const duplicatePhotos = useProjectStore((s) => s.duplicatePhotos);
```

- [ ] **Step 2: Add keydown listener**

Add a new `useEffect` after the existing resize listener effect (after line ~83). The existing resize listener targets `mousemove`/`mouseup` on `window` — add the keyboard effect separately:

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.key !== "d") return;
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
    const ids = [...useProjectStore.getState().selectedPhotoIds];
    if (ids.length === 0) return;
    e.preventDefault();
    duplicatePhotos(ids);
  };
  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [duplicatePhotos]);
```

- [ ] **Step 3: TypeScript check**

```
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Manual smoke test**

Run `npm run tauri dev`, import 2+ photos, click one to select it, press Ctrl+D:
- Copy appears immediately to its right
- Copy is selected (highlighted), original is not
- Pressing Ctrl+D again duplicates the copy
- Ctrl+Z undoes each duplicate
- With focus in a text input, Ctrl+D does nothing

- [ ] **Step 5: Commit**

```
git add src/components/Filmstrip/Filmstrip.tsx
git commit -m "feat(filmstrip): Ctrl+D shortcut to duplicate selected photos"
```

---

### Task 4: Run full test suite

- [ ] **Step 1: Run all frontend tests**

```
npx vitest run
```

Expected: all tests pass, including existing `bpmDetector` and `photoImport` tests

- [ ] **Step 2: TypeScript check**

```
npx tsc --noEmit
```

Expected: no errors

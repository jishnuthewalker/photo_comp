# Photo Drop Import Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to drop photo files anywhere on the desktop app and review the imported thumbnails in the existing import modal before adding them to the filmstrip.

**Architecture:** Listen to Tauri's native `getCurrentWebview().onDragDropEvent()` once in `App.tsx`. Pass dropped file paths into `PhotoGrid`, which reuses `import_images` and merges thumbnail results into the current modal selection through a pure helper.

**Tech Stack:** React 18, TypeScript, Tauri 2 webview API, Vitest

---

### Task 1: Dropped-photo merge helper

**Files:**
- Create: `src/lib/photoImport.ts`
- Create: `src/test/photoImport.test.ts`

- [ ] Write failing tests for appending imported photos and preselecting only newly appended indexes.
- [ ] Implement the minimal pure merge helper.
- [ ] Run `vitest run src/test/photoImport.test.ts`.

### Task 2: App-wide native drop listener

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/style.css`

- [ ] Subscribe to `getCurrentWebview().onDragDropEvent()`.
- [ ] Show a full-window drop overlay during enter/over events.
- [ ] Open the import modal with dropped paths on drop.
- [ ] Clear overlay state on leave and clean up the listener on unmount.

### Task 3: Modal dropped-path ingestion

**Files:**
- Modify: `src/components/PhotoGrid/PhotoGrid.tsx`

- [ ] Accept optional dropped paths.
- [ ] Run dropped paths through `import_images` when the modal opens or paths change.
- [ ] Append dialog imports and dropped imports through one shared function.
- [ ] Preserve HEIC prompt, errors, and confirmation behavior.

### Task 4: Verification

- [ ] Run `npm run build`.
- [ ] Run `vitest run`.
- [ ] Run `git diff --check`.

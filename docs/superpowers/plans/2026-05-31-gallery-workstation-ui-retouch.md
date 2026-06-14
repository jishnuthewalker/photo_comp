# Gallery Workstation UI Retouch Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retouch the full desktop editor into a light-first gallery workstation with a persistent light/dark toggle while preserving all existing editing behavior.

**Architecture:** Replace the starter Vite CSS and distributed hardcoded colors with shared CSS tokens and semantic classes. Keep component state and data flow unchanged except for app-level theme persistence in `localStorage`.

**Tech Stack:** React 18, TypeScript, vanilla CSS, Tauri 2, Vitest

---

### Task 1: Shared theme layer

**Files:**
- Modify: `src/style.css`
- Modify: `src/App.tsx`

- [ ] Replace the starter stylesheet with light and graphite dark token sets.
- [ ] Add reusable classes for shell, toolbar, controls, buttons, inputs, errors, and overlays.
- [ ] Add a localStorage-backed theme toggle with light as the default.
- [ ] Run `npm run build`.

### Task 2: Editor surfaces

**Files:**
- Modify: `src/components/Filmstrip/Filmstrip.tsx`
- Modify: `src/components/Filmstrip/FilmstripCell.tsx`
- Modify: `src/components/Filmstrip/SelectionToolbar.tsx`
- Modify: `src/components/Filmstrip/CellContextMenu.tsx`
- Modify: `src/components/PreviewCanvas/PreviewCanvas.tsx`

- [ ] Apply semantic classes to the filmstrip, selection states, toolbar, and context menu.
- [ ] Add a composed preview-stage empty state without changing canvas rendering behavior.
- [ ] Run `npm run build`.

### Task 3: Controls, import, and export

**Files:**
- Modify: `src/components/BpmControls/BpmControls.tsx`
- Modify: `src/components/ControlsPanel/ControlsPanel.tsx`
- Modify: `src/components/ExportPanel/ExportPanel.tsx`
- Modify: `src/components/PhotoGrid/PhotoGrid.tsx`
- Modify: `src/components/PhotoGrid/PhotoGridCell.tsx`
- Modify: `index.html`

- [ ] Restyle the editor control rows with consistent labels, fields, buttons, and status text.
- [ ] Retouch the import overlay and grid selection states.
- [ ] Replace the starter favicon reference and update document metadata.
- [ ] Run `npm run build` and `vitest run`.

### Task 4: Visual verification

- [ ] Launch the frontend preview.
- [ ] Inspect the full app in light and dark mode.
- [ ] Run `git diff --check`.

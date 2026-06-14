# Import Duplicate Review Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fresh native-drop review sessions, filename arrangement, and opt-in path/content duplicate review actions.

**Architecture:** Keep normal import fast. Add a Rust `analyze_duplicates` command that canonicalizes paths and hashes bytes only when requested, then attach returned metadata to review photos. Use pure TypeScript helpers for session creation, sorting, counts, and removal so UI state transitions are covered by focused tests.

**Tech Stack:** React, TypeScript, Vitest, Tauri 2, Rust, Rayon, SHA-256

---

### Task 1: Pure frontend import helpers

**Files:**
- Modify: `src/lib/photoImport.ts`
- Modify: `src/test/photoImport.test.ts`

- [ ] Add failing tests for fresh drop-session creation, basename sorting, path duplicate removal, and content duplicate removal.
- [ ] Run `npx vitest run src/test/photoImport.test.ts` and confirm failures.
- [ ] Add duplicate metadata types and minimal pure helper implementations.
- [ ] Run `npx vitest run src/test/photoImport.test.ts` and confirm passes.

### Task 2: Rust duplicate analysis command

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/commands/import.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] Add failing Rust unit tests using temporary files for repeated paths and identical bytes at different paths.
- [ ] Run `cargo test --target x86_64-pc-windows-gnu commands::import -- --nocapture` and confirm failures.
- [ ] Add `sha2`, implement `analyze_duplicates`, offload work with `spawn_blocking`, and register the command.
- [ ] Re-run the focused Rust tests and confirm passes.

### Task 3: Modal and native-drop integration

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/PhotoGrid/PhotoGrid.tsx`
- Modify: `src/style.css`

- [ ] Increment a review-session key on every native drop and pass it as the `PhotoGrid` React key.
- [ ] Add `Analyze duplicates` and `Arrange by filename` controls.
- [ ] Show selected-photo path/content duplicate counts and separate removal buttons.
- [ ] Clear stale analysis whenever new files append.
- [ ] Run TypeScript validation and frontend tests.

### Task 4: Documentation and verification

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`

- [ ] Document opt-in duplicate analysis, filename arrangement, and fresh native-drop sessions.
- [ ] Run `npx vitest run`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `cargo test --target x86_64-pc-windows-gnu`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.

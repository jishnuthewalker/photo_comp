import type { Platform } from "./types";

let _platform: Platform | undefined;

/**
 * Initialize the platform abstraction with a concrete implementation.
 * Must be called before rendering any shared components.
 * Typically called in the app entry point (main.tsx for web, src-tauri/tauri.conf.json hook for desktop).
 */
export function setPlatform(p: Platform): void {
  _platform = p;
}

/**
 * Get the current platform implementation.
 * Throws if setPlatform() has not been called yet.
 */
export function platform(): Platform {
  if (!_platform)
    throw new Error(
      "Platform not initialized. Call setPlatform() before rendering components."
    );
  return _platform;
}

export type {
  Platform,
  PickedFile,
  SongRef,
  DuplicateReport,
  DuplicateGroup,
  RenderRequest,
  RenderResult,
} from "./types";

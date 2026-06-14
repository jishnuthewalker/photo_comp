import type { ImportedPhoto } from "./photoImport";

interface DesktopImportResult {
  photos: ImportedPhoto[];
  heicPaths: string[];
}

interface DesktopDuplicateFingerprint {
  normalizedPath: string;
  contentHash: string;
}

export async function importDesktopImages(paths: string[], thumbSize: number) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<DesktopImportResult>("import_images", { paths, thumbSize });
}

export async function convertDesktopHeic(heicPaths: string[]) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string[]>("convert_heic", { heicPaths });
}

export async function analyzeDesktopDuplicates(paths: string[]) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<DesktopDuplicateFingerprint[]>("analyze_duplicates", { paths });
}

export async function checkDesktopFfmpeg() {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<void>("check_ffmpeg");
}

export async function listenDesktopFileDrops(
  onDrop: (paths: string[]) => void,
  onEnter?: () => void,
  onLeave?: () => void
) {
  try {
    const { getCurrentWebview } = await import("@tauri-apps/api/webview");
    const webview = getCurrentWebview();
    return webview.onDragDropEvent((event) => {
      if (event.payload.type === "enter" || event.payload.type === "over") {
        onEnter?.();
        return;
      }

      if (event.payload.type === "drop") {
        onLeave?.();
        onDrop(event.payload.paths);
        return;
      }

      onLeave?.();
    });
  } catch {
    return undefined;
  }
}

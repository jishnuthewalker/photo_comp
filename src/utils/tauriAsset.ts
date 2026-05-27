import { convertFileSrc } from "@tauri-apps/api/core";

/** Convert a local filesystem path to a tauri asset:// URL for use in <img> src */
export function assetUrl(filePath: string): string {
  return convertFileSrc(filePath);
}

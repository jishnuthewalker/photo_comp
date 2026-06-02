import { platform } from "../lib/platform";

export function assetUrl(path: string): string {
  return platform().assetUrl(path);
}

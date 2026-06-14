import type { Platform } from "@framecut/shared/lib/platform";
import { TauriPlatform } from "./tauri";

export const tauriPlatform: Platform = new TauriPlatform();

import type { Project } from "@framecut/shared/store/types";

// Retained file handle for autosave without re-prompting
let _saveHandle: FileSystemFileHandle | null = null;

/**
 * Save a project to disk using File System Access API (or fallback to download).
 * On first save, prompts for location and retains the handle for future autosaves.
 * Subsequent saves use the retained handle without prompting.
 *
 * @param project - The project to save
 * @returns Filename if successful; "download" if fallback was used
 * @throws Error if save was cancelled or failed
 */
export async function saveProject(project: Project): Promise<string> {
  if (!_saveHandle) {
    // Prompt for save location
    if ("showSaveFilePicker" in window) {
      try {
        _saveHandle = await (window as any).showSaveFilePicker({
          suggestedName: `${project.name ?? "project"}.framecut`,
          types: [
            {
              description: "Framecut Project",
              accept: { "application/json": [".framecut"] },
            },
          ],
        });
      } catch (e: any) {
        if (e.name === "AbortError") throw new Error("cancelled");
        throw e;
      }
    } else {
      // Fallback: trigger download
      downloadBlob(
        JSON.stringify(project, null, 2),
        `${project.name ?? "project"}.framecut`
      );
      return "download";
    }
  }

  // Write to the retained handle (guaranteed non-null after the check above)
  const writable = await _saveHandle!.createWritable();
  await writable.write(JSON.stringify(project, null, 2));
  await writable.close();

  return _saveHandle!.name;
}

/**
 * Load a project from disk using File System Access API (or fallback to `<input>`).
 * If successful, retains the file handle for future saves to the same file.
 *
 * @returns The loaded project, or null if loading was cancelled
 * @throws Error if the file is invalid or schema version is unsupported
 */
export async function loadProject(): Promise<Project | null> {
  let file: File;

  if ("showOpenFilePicker" in window) {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [
          {
            description: "Framecut Project",
            accept: { "application/json": [".framecut", ".photocomp"] },
          },
        ],
      });
      // Retain the handle for future saves
      _saveHandle = handle;
      file = await handle.getFile();
    } catch (e: any) {
      if (e.name === "AbortError") return null;
      throw e;
    }
  } else {
    // Fallback: <input type="file">
    file = await new Promise<File>((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".framecut,.photocomp,application/json";

      input.onchange = () => {
        const f = input.files?.[0];
        if (f) {
          resolve(f);
        } else {
          reject(new Error("cancelled"));
        }
      };

      input.oncancel = () => reject(new Error("cancelled"));

      input.click();
    });
  }

  const text = await file.text();
  const project = JSON.parse(text) as Project;

  if (project.schemaVersion !== 1) {
    throw new Error(`Unknown schema version: ${project.schemaVersion}`);
  }

  return project;
}

/**
 * Clear the retained file handle (e.g., on creating a new project).
 * The next save will prompt for location again.
 */
export function resetSaveHandle(): void {
  _saveHandle = null;
}

/**
 * Download a JSON string as a file (fallback for environments without File System Access API).
 */
function downloadBlob(content: string, filename: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

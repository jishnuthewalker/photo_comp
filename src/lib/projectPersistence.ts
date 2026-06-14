import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { save, open } from "@tauri-apps/plugin-dialog";
import type { Project } from "../store/types";

export function normalizeProject(raw: Partial<Project> & Record<string, unknown>): Project {
  return {
    cropRatio: "1:1",
    ...raw,
  } as Project;
}

export async function saveProject(project: Project, filePath?: string): Promise<string> {
  const path = filePath ?? await save({ filters: [{ name: "Project", extensions: ["photocomp"] }] });
  if (!path) throw new Error("cancelled");
  await writeTextFile(path, JSON.stringify(project, null, 2));
  return path;
}

export async function loadProject(): Promise<Project | null> {
  const path = await open({ filters: [{ name: "Project", extensions: ["photocomp"] }] });
  if (!path || Array.isArray(path)) return null;
  const text = await readTextFile(path as string);
  const project = JSON.parse(text) as Project;
  if (project.schemaVersion !== 1) throw new Error(`Unknown schema version: ${project.schemaVersion}`);
  return project;
}

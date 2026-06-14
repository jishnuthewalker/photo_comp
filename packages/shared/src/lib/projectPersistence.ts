import { platform } from "../lib/platform";
import type { Project } from "../store/types";

export async function saveProject(project: Project): Promise<string> {
  return platform().saveProject(project);
}

export async function loadProject(): Promise<Project | null> {
  return platform().loadProject();
}

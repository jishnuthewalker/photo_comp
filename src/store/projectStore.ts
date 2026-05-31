import { create, useStore } from "zustand";
import { temporal } from "zundo";
import { nanoid } from "nanoid";
import equal from "fast-deep-equal";
import type { Project, Photo, AudioFile, OutputConfig, AspectRatio, Alignment, Transition, ScaleMode } from "./types";

function defaultProject(): Project {
  return {
    schemaVersion: 1,
    id: nanoid(),
    name: "Untitled Project",
    photos: [],
    bpm: 120,
    firstBeatOffsetMs: 0,
    beatsPerPhoto: 1,
    cropRatio: "16:9",
    alignment: "center",
    scaleMode: "cover",
    globalTransition: "cut",
    outputConfig: { format: "mp4", resolution: "1080p", fps: 30 },
    lastModified: Date.now(),
  };
}

interface ProjectState {
  project: Project;
  setPhotos: (photos: Photo[]) => void;
  addPhotos: (photos: Photo[]) => void;
  reorderPhotos: (fromIndex: number, toIndex: number) => void;
  removePhoto: (id: string) => void;
  setPhotoBeatsOverride: (id: string, beats: number | undefined) => void;
  setBpm: (bpm: number) => void;
  setFirstBeatOffsetMs: (ms: number) => void;
  setBeatsPerPhoto: (n: number) => void;
  setCropRatio: (ratio: AspectRatio) => void;
  setAlignment: (alignment: Alignment) => void;
  setScaleMode: (mode: ScaleMode) => void;
  setGlobalTransition: (t: Transition) => void;
  setSong: (song: AudioFile | undefined) => void;
  setOutputConfig: (config: OutputConfig) => void;
  setName: (name: string) => void;
  loadProject: (project: Project) => void;
}

function touch(project: Project): Project {
  return { ...project, lastModified: Date.now() };
}

export const useProjectStore = create<ProjectState>()(
  temporal(
    (set) => ({
      project: defaultProject(),

      setPhotos: (photos) => set((s) => ({ project: touch({ ...s.project, photos }) })),
      addPhotos: (photos) =>
        set((s) => ({ project: touch({ ...s.project, photos: [...s.project.photos, ...photos] }) })),
      reorderPhotos: (fromIndex, toIndex) =>
        set((s) => {
          const photos = [...s.project.photos];
          if (fromIndex < 0 || toIndex < 0 || fromIndex >= photos.length || toIndex >= photos.length) return s;
          const [moved] = photos.splice(fromIndex, 1);
          photos.splice(toIndex, 0, moved);
          return { project: touch({ ...s.project, photos }) };
        }),
      removePhoto: (id) =>
        set((s) => ({ project: touch({ ...s.project, photos: s.project.photos.filter((p) => p.id !== id) }) })),
      setPhotoBeatsOverride: (id, beats) =>
        set((s) => ({
          project: touch({
            ...s.project,
            photos: s.project.photos.map((p) => {
              if (p.id !== id) return p;
              const updated = { ...p };
              if (beats === undefined) {
                delete updated.beatsOverride;
              } else {
                updated.beatsOverride = beats;
              }
              return updated;
            }),
          }),
        })),
      setBpm: (bpm) => set((s) => ({ project: touch({ ...s.project, bpm }) })),
      setFirstBeatOffsetMs: (firstBeatOffsetMs) =>
        set((s) => ({ project: touch({ ...s.project, firstBeatOffsetMs }) })),
      setBeatsPerPhoto: (beatsPerPhoto) =>
        set((s) => ({ project: touch({ ...s.project, beatsPerPhoto }) })),
      setCropRatio: (cropRatio) => set((s) => ({ project: touch({ ...s.project, cropRatio }) })),
      setAlignment: (alignment) => set((s) => ({ project: touch({ ...s.project, alignment }) })),
      setScaleMode: (scaleMode) => set((s) => ({ project: touch({ ...s.project, scaleMode }) })),
      setGlobalTransition: (globalTransition) =>
        set((s) => ({ project: touch({ ...s.project, globalTransition }) })),
      setSong: (song) => set((s) => ({ project: touch({ ...s.project, song }) })),
      setOutputConfig: (outputConfig) =>
        set((s) => ({ project: touch({ ...s.project, outputConfig }) })),
      setName: (name) => set((s) => ({ project: touch({ ...s.project, name }) })),
      loadProject: (project) => {
        set({ project });
        // clear undo history so user can't undo back to previous project
        setTimeout(() => useProjectStore.temporal.getState().clear(), 0);
      },
    }),
    {
      // Track undo for meaningful state changes only
      partialize: (state) => ({ project: state.project }),
      equality: (a, b) => {
        // Don't create undo entry if only lastModified changed
        const ap = { ...a.project, lastModified: 0 };
        const bp = { ...b.project, lastModified: 0 };
        return equal(ap, bp);
      },
    }
  )
);

export const useTemporalStore = <T>(selector: (state: ReturnType<typeof useProjectStore.temporal.getState>) => T) =>
  useStore(useProjectStore.temporal, selector);

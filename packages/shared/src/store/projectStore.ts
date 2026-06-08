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
  clearPhotos: () => void;
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

  // Selection (outside `project`, excluded from undo)
  selectedPhotoIds: Set<string>;
  selectionAnchorId: string | null;
  setSelection: (ids: string[]) => void;
  toggleSelection: (id: string) => void;
  selectRange: (toIndex: number) => void;
  clearSelection: () => void;
  setSelectionAnchor: (id: string | null) => void;

  // New bulk photo actions
  reorderPhotosMulti: (ids: string[], toIndex: number) => void;
  removePhotos: (ids: string[]) => void;
  setPhotosBeatsOverride: (ids: string[], beats: number | undefined) => void;
  duplicatePhotos: (ids: string[]) => void;
}

function touch(project: Project): Project {
  return { ...project, lastModified: Date.now() };
}

export const useProjectStore = create<ProjectState>()(
  temporal(
    (set) => ({
      project: defaultProject(),

      selectedPhotoIds: new Set<string>(),
      selectionAnchorId: null,

      setPhotos: (photos) =>
        set((s) => ({
          project: touch({ ...s.project, photos }),
          selectedPhotoIds: new Set<string>(),
          selectionAnchorId: null,
        })),
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
      reorderPhotosMulti: (ids, toIndex) =>
        set((s) => {
          const photos = s.project.photos;
          const idSet = new Set(ids);
          const moved = photos.filter((p) => idSet.has(p.id));
          if (moved.length === 0) return {};
          const remaining = photos.filter((p) => !idSet.has(p.id));
          const targetId = photos[toIndex]?.id;
          let insertAt: number;
          if (targetId === undefined || idSet.has(targetId)) {
            insertAt = photos.slice(0, toIndex).filter((p) => !idSet.has(p.id)).length;
          } else {
            const targetIdxInRemaining = remaining.findIndex((p) => p.id === targetId);
            const firstMovedOrigIdx = photos.findIndex((p) => idSet.has(p.id));
            insertAt = firstMovedOrigIdx < toIndex ? targetIdxInRemaining + 1 : targetIdxInRemaining;
          }
          const next = [...remaining];
          next.splice(insertAt, 0, ...moved);
          return { project: touch({ ...s.project, photos: next }) };
        }),
      removePhoto: (id) =>
        set((s) => {
          const photos = s.project.photos.filter((p) => p.id !== id);
          const sel = new Set(s.selectedPhotoIds);
          sel.delete(id);
          const anchorId = s.selectionAnchorId === id ? null : s.selectionAnchorId;
          return { project: touch({ ...s.project, photos }), selectedPhotoIds: sel, selectionAnchorId: anchorId };
        }),
      removePhotos: (ids) =>
        set((s) => {
          const idSet = new Set(ids);
          const photos = s.project.photos.filter((p) => !idSet.has(p.id));
          const sel = new Set(s.selectedPhotoIds);
          ids.forEach((id) => sel.delete(id));
          const anchorId = s.selectionAnchorId && idSet.has(s.selectionAnchorId) ? null : s.selectionAnchorId;
          return { project: touch({ ...s.project, photos }), selectedPhotoIds: sel, selectionAnchorId: anchorId };
        }),
      clearPhotos: () =>
        set((s) => ({
          project: touch({ ...s.project, photos: [] }),
          selectedPhotoIds: new Set<string>(),
          selectionAnchorId: null,
        })),
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
      setPhotosBeatsOverride: (ids, beats) =>
        set((s) => {
          const idSet = new Set(ids);
          const photos = s.project.photos.map((p) => {
            if (!idSet.has(p.id)) return p;
            const updated = { ...p };
            if (beats === undefined) {
              delete updated.beatsOverride;
            } else {
              updated.beatsOverride = beats;
            }
            return updated;
          });
          return { project: touch({ ...s.project, photos }) };
        }),
      duplicatePhotos: (ids) =>
        set((s) => {
          if (ids.length === 0) return {};
          const idSet = new Set(ids);
          const photos = s.project.photos;
          const rightmostIndex = photos.reduce(
            (max, p, i) => (idSet.has(p.id) ? Math.max(max, i) : max),
            -1
          );
          if (rightmostIndex === -1) return {};
          const copies = photos
            .filter((p) => idSet.has(p.id))
            .map((p) => ({ ...p, id: nanoid() }));
          const next = [...photos];
          next.splice(rightmostIndex + 1, 0, ...copies);
          const newIds = copies.map((c) => c.id);
          return {
            project: touch({ ...s.project, photos: next }),
            selectedPhotoIds: new Set(newIds),
            selectionAnchorId: newIds[newIds.length - 1] ?? null,
          };
        }),
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
        set({
          project,
          selectedPhotoIds: new Set<string>(),
          selectionAnchorId: null,
        });
        // clear undo history so user can't undo back to previous project
        setTimeout(() => useProjectStore.temporal.getState().clear(), 0);
      },

      setSelection: (ids) => set({ selectedPhotoIds: new Set(ids) }),

      toggleSelection: (id) =>
        set((s) => {
          const next = new Set(s.selectedPhotoIds);
          next.has(id) ? next.delete(id) : next.add(id);
          return { selectedPhotoIds: next };
        }),

      selectRange: (toIndex) =>
        set((s) => {
          const photos = s.project.photos;
          const anchorIndex = s.selectionAnchorId
            ? photos.findIndex((p) => p.id === s.selectionAnchorId)
            : -1;
          if (anchorIndex === -1) {
            const id = photos[toIndex]?.id;
            return id ? { selectedPhotoIds: new Set([id]), selectionAnchorId: id } : {};
          }
          const lo = Math.min(anchorIndex, toIndex);
          const hi = Math.max(anchorIndex, toIndex);
          return { selectedPhotoIds: new Set(photos.slice(lo, hi + 1).map((p) => p.id)) };
        }),

      clearSelection: () => set({ selectedPhotoIds: new Set<string>(), selectionAnchorId: null }),

      setSelectionAnchor: (id) => set({ selectionAnchorId: id }),
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

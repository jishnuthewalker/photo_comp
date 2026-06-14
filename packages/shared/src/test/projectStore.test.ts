import { describe, it, expect, beforeEach } from "vitest";
import { useProjectStore } from "../store/projectStore";
import type { Photo } from "../store/types";

function makePhoto(id: string, overrides?: Partial<Photo>): Photo {
  return {
    id,
    originalPath: `/photos/${id}.jpg`,
    thumbPath: `/thumbs/${id}.jpg`,
    ...overrides,
  };
}

function resetStore(photos: Photo[] = [], selectedIds: string[] = []) {
  useProjectStore.setState({
    project: {
      schemaVersion: 1,
      id: "test",
      name: "Test",
      photos,
      bpm: 120,
      firstBeatOffsetMs: 0,
      beatsPerPhoto: 1,
      cropRatio: "16:9",
      alignment: "center",
      scaleMode: "cover",
      globalTransition: "cut",
      outputConfig: { format: "mp4", resolution: "1080p", fps: 30 },
      lastModified: 0,
    },
    selectedPhotoIds: new Set(selectedIds),
    selectionAnchorId: selectedIds[selectedIds.length - 1] ?? null,
  });
}

describe("duplicatePhotos", () => {
  beforeEach(() => resetStore());

  it("inserts copies after the rightmost selected photo", () => {
    const a = makePhoto("a");
    const b = makePhoto("b");
    const c = makePhoto("c");
    resetStore([a, b, c], ["a", "b"]);

    useProjectStore.getState().duplicatePhotos(["a", "b"]);

    const photos = useProjectStore.getState().project.photos;
    expect(photos).toHaveLength(5);
    expect(photos[0].id).toBe("a");
    expect(photos[1].id).toBe("b");
    expect(photos[2].originalPath).toBe(a.originalPath);
    expect(photos[3].originalPath).toBe(b.originalPath);
    expect(photos[4].id).toBe("c");
    expect(photos[2].id).not.toBe("a");
    expect(photos[3].id).not.toBe("b");
  });

  it("preserves beatsOverride on copies", () => {
    const a = makePhoto("a", { beatsOverride: 2 });
    resetStore([a], ["a"]);

    useProjectStore.getState().duplicatePhotos(["a"]);

    const photos = useProjectStore.getState().project.photos;
    expect(photos[1].beatsOverride).toBe(2);
  });

  it("selects the new copies after duplicate", () => {
    const a = makePhoto("a");
    const b = makePhoto("b");
    resetStore([a, b], ["a"]);

    useProjectStore.getState().duplicatePhotos(["a"]);

    const { selectedPhotoIds, selectionAnchorId, project } = useProjectStore.getState();
    const copyId = project.photos[1].id;
    expect(selectedPhotoIds.has(copyId)).toBe(true);
    expect(selectedPhotoIds.has("a")).toBe(false);
    expect(selectionAnchorId).toBe(copyId);
  });

  it("does nothing when ids list is empty", () => {
    const a = makePhoto("a");
    resetStore([a], []);

    useProjectStore.getState().duplicatePhotos([]);

    expect(useProjectStore.getState().project.photos).toHaveLength(1);
  });

  it("handles single photo at end of strip", () => {
    const a = makePhoto("a");
    const b = makePhoto("b");
    resetStore([a, b], ["b"]);

    useProjectStore.getState().duplicatePhotos(["b"]);

    const photos = useProjectStore.getState().project.photos;
    expect(photos).toHaveLength(3);
    expect(photos[2].originalPath).toBe(b.originalPath);
    expect(photos[2].id).not.toBe("b");
  });
});

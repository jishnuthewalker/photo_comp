import { describe, it, expect } from "vitest";
import { normalizeProject } from "../lib/projectPersistence";

describe("normalizeProject", () => {
  it("defaults missing cropRatio to square on load", () => {
    const normalized = normalizeProject({
      schemaVersion: 1,
      id: "project-1",
      name: "Legacy project",
      photos: [],
      bpm: 120,
      firstBeatOffsetMs: 0,
      beatsPerPhoto: 1,
      alignment: "center",
      scaleMode: "cover",
      globalTransition: "cut",
      outputConfig: { format: "mp4", resolution: "1080p", fps: 30 },
      lastModified: 0,
    });

    expect(normalized.cropRatio).toBe("1:1");
  });
});

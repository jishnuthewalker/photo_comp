import { describe, it, expect } from "vitest";
import { buildCumulativeTimeline, buildFrameCounts } from "../lib/cumulativeTimeline";
import type { Photo } from "../store/types";

function makePhoto(id: string, beatsOverride?: number): Photo {
  return { id, originalPath: "", thumbPath: "", beatsOverride };
}

describe("render timeline invariants", () => {
  describe("totalDurationS equals sum of per-photo beat durations", () => {
    it("simple case: 3 photos, 120bpm, 2 beats each, no offset", () => {
      const photos = [makePhoto("1"), makePhoto("2"), makePhoto("3")];
      const bpm = 120; // 0.5s per beat
      const beatsPerPhoto = 2; // 1s per photo
      const firstBeatOffsetMs = 0;
      const fps = 30;

      const times = buildCumulativeTimeline(photos, bpm, beatsPerPhoto, firstBeatOffsetMs);
      const beatDuration = 60 / bpm;
      const lastTime = times[times.length - 1] ?? 0;
      const lastBeats = beatsPerPhoto; // no override
      const totalDuration = lastTime + beatDuration * lastBeats - firstBeatOffsetMs / 1000;

      // Each photo = (60/120)*2 = 1s, 3 photos = 3s
      expect(totalDuration).toBeCloseTo(3.0, 5);
    });

    it("with non-zero firstBeatOffsetMs", () => {
      const photos = [makePhoto("1"), makePhoto("2")];
      const bpm = 120; // 0.5s per beat
      const beatsPerPhoto = 1; // 0.5s per photo
      const firstBeatOffsetMs = 500; // 0.5s offset
      const fps = 30;

      const times = buildCumulativeTimeline(photos, bpm, beatsPerPhoto, firstBeatOffsetMs);
      const beatDuration = 60 / bpm;
      const lastTime = times[times.length - 1] ?? 0;
      const lastBeats = beatsPerPhoto;
      const totalDuration = lastTime + beatDuration * lastBeats - firstBeatOffsetMs / 1000;

      // Each photo = 0.5s, 2 photos = 1s
      // totalDuration = 1.0 + 0.5 - 0.5 = 1.0
      expect(totalDuration).toBeCloseTo(1.0, 5);
    });

    it("with per-photo beat overrides", () => {
      const photos = [makePhoto("1", 3), makePhoto("2", 1), makePhoto("3", 2)];
      const bpm = 120;
      const beatsPerPhoto = 2; // not used due to overrides
      const firstBeatOffsetMs = 0;
      const fps = 30;

      const times = buildCumulativeTimeline(photos, bpm, beatsPerPhoto, firstBeatOffsetMs);
      const beatDuration = 60 / bpm;
      const lastTime = times[times.length - 1] ?? 0;
      const lastBeats = photos[photos.length - 1].beatsOverride ?? beatsPerPhoto;
      const totalDuration = lastTime + beatDuration * lastBeats - firstBeatOffsetMs / 1000;

      // Photo 1: 3 * 0.5 = 1.5s
      // Photo 2: 1 * 0.5 = 0.5s
      // Photo 3: 2 * 0.5 = 1.0s
      // Total: 3.0s
      expect(totalDuration).toBeCloseTo(3.0, 5);
    });
  });

  describe("sum of frameCounts equals round(totalDurationS * fps)", () => {
    it("simple case: 3 photos at 120bpm, 2 beats each, 30fps", () => {
      const photos = [makePhoto("1"), makePhoto("2"), makePhoto("3")];
      const bpm = 120;
      const beatsPerPhoto = 2;
      const firstBeatOffsetMs = 0;
      const fps = 30;

      const frameCounts = buildFrameCounts(photos, bpm, beatsPerPhoto, firstBeatOffsetMs, fps);
      const times = buildCumulativeTimeline(photos, bpm, beatsPerPhoto, firstBeatOffsetMs);
      const beatDuration = 60 / bpm;
      const lastTime = times[times.length - 1] ?? 0;
      const lastBeats = beatsPerPhoto;
      const totalDuration = lastTime + beatDuration * lastBeats - firstBeatOffsetMs / 1000;

      const sumFrames = frameCounts.reduce((a, b) => a + b, 0);
      const expectedFrames = Math.round(totalDuration * fps);

      // 3s * 30fps = 90 frames
      expect(totalDuration).toBeCloseTo(3.0, 5);
      expect(expectedFrames).toBe(90);
      expect(sumFrames).toBe(expectedFrames);
    });

    it("handles fractional frame counts without drift (60 photos, 24fps)", () => {
      const photos = Array.from({ length: 60 }, (_, i) => makePhoto(String(i)));
      const bpm = 103; // awkward: 60/103 ≈ 0.5825s per beat, not integer frames at 24fps
      const beatsPerPhoto = 1;
      const firstBeatOffsetMs = 0;
      const fps = 24;

      const frameCounts = buildFrameCounts(photos, bpm, beatsPerPhoto, firstBeatOffsetMs, fps);
      const sumFrames = frameCounts.reduce((a, b) => a + b, 0);
      const times = buildCumulativeTimeline(photos, bpm, beatsPerPhoto, firstBeatOffsetMs);
      const beatDuration = 60 / bpm;
      const lastTime = times[times.length - 1] ?? 0;
      const lastBeats = beatsPerPhoto;
      const totalDuration = lastTime + beatDuration * lastBeats - firstBeatOffsetMs / 1000;
      const expectedFrames = Math.round(totalDuration * fps);

      // Should match exactly
      expect(sumFrames).toBe(expectedFrames);
    });

    it("respects per-photo overrides in frame computation", () => {
      const photos = [
        makePhoto("1", 2), // 1s at 120bpm
        makePhoto("2", 1), // 0.5s at 120bpm
        makePhoto("3", 1), // 0.5s at 120bpm
      ];
      const bpm = 120;
      const beatsPerPhoto = 1; // not used
      const firstBeatOffsetMs = 0;
      const fps = 30;

      const frameCounts = buildFrameCounts(photos, bpm, beatsPerPhoto, firstBeatOffsetMs, fps);
      const sumFrames = frameCounts.reduce((a, b) => a + b, 0);

      // Total duration = 1 + 0.5 + 0.5 = 2s
      // 2s * 30fps = 60 frames
      expect(sumFrames).toBe(60);
    });
  });

  describe("firstBeatOffsetMs shifts start time but not total duration", () => {
    it("timeline starts at offset, then durations are identical", () => {
      const photos = [makePhoto("1"), makePhoto("2"), makePhoto("3")];
      const bpm = 120;
      const beatsPerPhoto = 1;
      const fps = 30;

      const offsetA = buildCumulativeTimeline(photos, bpm, beatsPerPhoto, 0);
      const offsetB = buildCumulativeTimeline(photos, bpm, beatsPerPhoto, 500);

      // Both should have the same number of entries
      expect(offsetA.length).toBe(offsetB.length);

      // The difference between start times should be firstBeatOffsetMs in seconds
      expect(offsetB[0] - offsetA[0]).toBeCloseTo(0.5, 5);

      // All subsequent photo times should shift by the same offset
      for (let i = 0; i < offsetA.length; i++) {
        expect(offsetB[i] - offsetA[i]).toBeCloseTo(0.5, 5);
      }
    });

    it("frameCounts are identical regardless of firstBeatOffsetMs", () => {
      const photos = [makePhoto("1"), makePhoto("2"), makePhoto("3")];
      const bpm = 120;
      const beatsPerPhoto = 1;
      const fps = 30;

      const countsA = buildFrameCounts(photos, bpm, beatsPerPhoto, 0, fps);
      const countsB = buildFrameCounts(photos, bpm, beatsPerPhoto, 500, fps);

      // Frame counts should be identical (offset shifts the timeline but not durations)
      for (let i = 0; i < countsA.length; i++) {
        expect(countsB[i]).toBe(countsA[i]);
      }
    });
  });

  describe("frame counts are always positive integers", () => {
    it("no zero or negative frame counts", () => {
      const photos = [makePhoto("1"), makePhoto("2"), makePhoto("3")];
      const bpm = 120;
      const beatsPerPhoto = 1;
      const firstBeatOffsetMs = 0;
      const fps = 30;

      const frameCounts = buildFrameCounts(photos, bpm, beatsPerPhoto, firstBeatOffsetMs, fps);

      frameCounts.forEach((c) => {
        expect(Number.isInteger(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(1);
      });
    });

    it("even very small beat durations yield at least 1 frame", () => {
      const photos = [makePhoto("1", 0.1)]; // 0.05s at 120bpm
      const bpm = 120;
      const beatsPerPhoto = 1; // not used
      const firstBeatOffsetMs = 0;
      const fps = 30;

      const frameCounts = buildFrameCounts(photos, bpm, beatsPerPhoto, firstBeatOffsetMs, fps);

      expect(frameCounts[0]).toBeGreaterThanOrEqual(1);
    });
  });
});

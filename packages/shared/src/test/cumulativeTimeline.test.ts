import { describe, it, expect } from "vitest";
import { buildCumulativeTimeline, buildFrameCounts, binarySearchLE } from "../lib/cumulativeTimeline";
import type { Photo } from "../store/types";

function makePhoto(id: string, beatsOverride?: number): Photo {
  return { id, originalPath: "", thumbPath: "", beatsOverride };
}

describe("buildCumulativeTimeline", () => {
  it("returns start time for each photo at 120bpm, 1 beat each", () => {
    const photos = [makePhoto("a"), makePhoto("b"), makePhoto("c")];
    const times = buildCumulativeTimeline(photos, 120, 1, 0);
    expect(times[0]).toBeCloseTo(0);
    expect(times[1]).toBeCloseTo(0.5);
    expect(times[2]).toBeCloseTo(1.0);
  });

  it("respects firstBeatOffsetMs", () => {
    const photos = [makePhoto("a"), makePhoto("b")];
    const times = buildCumulativeTimeline(photos, 120, 1, 500);
    expect(times[0]).toBeCloseTo(0.5);
    expect(times[1]).toBeCloseTo(1.0);
  });

  it("respects per-photo beatsOverride", () => {
    const photos = [makePhoto("a", 2), makePhoto("b", 1)];
    const times = buildCumulativeTimeline(photos, 120, 1, 0);
    expect(times[0]).toBeCloseTo(0);
    expect(times[1]).toBeCloseTo(1.0); // 2 beats at 120bpm = 1s
  });

  it("supports fractional beatsPerPhoto (0.5)", () => {
    const photos = [makePhoto("a"), makePhoto("b"), makePhoto("c")];
    const times = buildCumulativeTimeline(photos, 120, 0.5, 0);
    expect(times[0]).toBeCloseTo(0);
    expect(times[1]).toBeCloseTo(0.25);
    expect(times[2]).toBeCloseTo(0.5);
  });
});

describe("buildFrameCounts", () => {
  it("integer frame counts sum to total expected frames — no rounding drift", () => {
    const n = 2000;
    const photos = Array.from({ length: n }, (_, i) => makePhoto(String(i)));
    const fps = 30;
    const bpm = 127; // deliberately awkward — 60/127 ≈ 0.4724s, not integer frames
    const counts = buildFrameCounts(photos, bpm, 1, 0, fps);
    const totalFrames = counts.reduce((a, b) => a + b, 0);
    const expectedFrames = Math.round((n * (60 / bpm)) * fps);
    // allow ±1 frame total drift across 2000 photos
    expect(Math.abs(totalFrames - expectedFrames)).toBeLessThanOrEqual(1);
  });

  it("each frame count is a positive integer", () => {
    const photos = [makePhoto("a"), makePhoto("b"), makePhoto("c")];
    const counts = buildFrameCounts(photos, 120, 1, 0, 30);
    counts.forEach((c) => {
      expect(Number.isInteger(c)).toBe(true);
      expect(c).toBeGreaterThan(0);
    });
  });
});

describe("binarySearchLE", () => {
  it("returns index of largest value <= target", () => {
    const times = [0, 0.5, 1.0, 1.5, 2.0];
    expect(binarySearchLE(times, 0.0)).toBe(0);
    expect(binarySearchLE(times, 0.4)).toBe(0);
    expect(binarySearchLE(times, 0.5)).toBe(1);
    expect(binarySearchLE(times, 1.3)).toBe(2);
    expect(binarySearchLE(times, 2.1)).toBe(4);
  });

  it("returns 0 for time before first beat", () => {
    const times = [0.5, 1.0];
    expect(binarySearchLE(times, 0.1)).toBe(0);
  });

  it("returns 0 for empty times array", () => {
    expect(binarySearchLE([], 1.0)).toBe(0);
  });
});

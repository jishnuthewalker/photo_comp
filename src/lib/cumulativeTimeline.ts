import type { Photo } from "../store/types";

export function buildCumulativeTimeline(
  photos: Photo[],
  bpm: number,
  beatsPerPhoto: number,
  firstBeatOffsetMs: number
): number[] {
  const beatDuration = 60 / bpm;
  const times: number[] = [];
  let t = firstBeatOffsetMs / 1000;
  for (const photo of photos) {
    times.push(t);
    t += beatDuration * (photo.beatsOverride ?? beatsPerPhoto);
  }
  return times;
}

export function buildFrameCounts(
  photos: Photo[],
  bpm: number,
  beatsPerPhoto: number,
  firstBeatOffsetMs: number,
  fps: number
): number[] {
  const times = buildCumulativeTimeline(photos, bpm, beatsPerPhoto, firstBeatOffsetMs);
  const beatDuration = 60 / bpm;
  return photos.map((photo, i) => {
    const startFrame = Math.round(times[i] * fps);
    const endSec =
      i + 1 < photos.length
        ? times[i + 1]
        : times[i] + beatDuration * (photo.beatsOverride ?? beatsPerPhoto);
    const endFrame = Math.round(endSec * fps);
    return Math.max(1, endFrame - startFrame);
  });
}

/**
 * Returns index of largest value in sorted `times` that is <= `target`.
 * Clamps to 0 if target is before times[0] or times is empty.
 */
export function binarySearchLE(times: number[], target: number): number {
  if (times.length === 0) return 0; // no photos — caller must handle empty case
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (times[mid] <= target) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

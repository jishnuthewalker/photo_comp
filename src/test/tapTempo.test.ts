import { describe, it, expect } from "vitest";
import { tapTempoMedian } from "../lib/tapTempo";

describe("tapTempoMedian", () => {
  it("returns null for < 2 taps", () => {
    expect(tapTempoMedian([1000])).toBeNull();
  });

  it("returns BPM from 2 taps at 500ms interval", () => {
    const bpm = tapTempoMedian([0, 500]);
    expect(bpm).toBeCloseTo(120, 0);
  });

  it("uses median of last 8 intervals", () => {
    // 9 taps: first interval is outlier 2000ms, rest are 500ms
    const taps = [0, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500];
    const bpm = tapTempoMedian(taps);
    expect(bpm).toBeCloseTo(120, 0); // median of 500ms intervals
  });

  it("returns null for duplicate timestamps (zero interval)", () => {
    expect(tapTempoMedian([1000, 1000])).toBeNull();
  });

  it("handles unsorted input by sorting first", () => {
    // Same intervals as the sorted case: 500ms each
    const taps = [500, 0, 1000, 1500]; // unsorted
    const bpm = tapTempoMedian(taps);
    expect(bpm).toBeCloseTo(120, 0);
  });
});

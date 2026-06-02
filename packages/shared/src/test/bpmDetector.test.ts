import { describe, it, expect, vi } from "vitest";

// Mock hoisted to top so vitest can intercept the module before bpmDetector imports it
vi.mock("essentia.js", () => ({
  EssentiaWASM: {},
  Essentia: class {
    RhythmExtractor2013() { return { bpm: 120, ticks: [0, 0.5, 1.0] }; }
    arrayToVector(arr: Float32Array) { return arr; }
    vectorToArray(v: unknown) { return v; }
  },
}));

// Test the interface contract only (essentia.js requires browser AudioContext, skip in jsdom)
describe("BpmDetector interface", () => {
  it("exports detect function matching IBpmDetector", async () => {
    const { EssentiaBpmDetector } = await import("../lib/bpmDetector");
    expect(typeof EssentiaBpmDetector.detect).toBe("function");
  });
});

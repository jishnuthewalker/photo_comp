/// <reference types="vite/client" />

declare module "essentia.js" {
  export const EssentiaWASM: unknown;
  export class Essentia {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(wasmModule: unknown);
    arrayToVector(arr: Float32Array): unknown;
    vectorToArray(v: unknown): Float32Array;
    RhythmExtractor2013(signal: unknown): { bpm: number; ticks: unknown };
  }
}

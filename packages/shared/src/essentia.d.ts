declare module "essentia.js/dist/essentia-wasm.web.js" {
  const EssentiaWASM: { ready: Promise<unknown> };
  export default EssentiaWASM;
}

declare module "essentia.js/dist/essentia.js-core.es.js" {
  class Essentia {
    constructor(wasmModule: unknown, isDebug?: boolean);
    arrayToVector(arr: Float32Array): unknown;
    vectorToArray(vec: unknown): Float32Array;
    RhythmExtractor2013(signal: unknown): { bpm: number; ticks: unknown };
  }
  export default Essentia;
}

export interface IBpmDetector {
  detect(buffer: AudioBuffer): Promise<{ bpm: number; beats: number[] }>;
}

let essentiaInstance: unknown = null;

async function getEssentia(): Promise<unknown> {
  if (!essentiaInstance) {
    const [{ default: EssentiaWASMLoader }, { default: Essentia }] = await Promise.all([
      import("essentia.js/dist/essentia-wasm.web.js"),
      import("essentia.js/dist/essentia.js-core.es.js"),
    ]);
    // Browser WASM module exposes a .ready Promise that resolves to the initialized module
    const wasmModule = await (EssentiaWASMLoader as unknown as { ready: Promise<unknown> })["ready"];
    essentiaInstance = new (Essentia as new (wasm: unknown) => unknown)(wasmModule);
  }
  return essentiaInstance;
}

export const EssentiaBpmDetector: IBpmDetector = {
  async detect(buffer: AudioBuffer) {
    const essentia = await getEssentia() as {
      arrayToVector: (arr: Float32Array) => unknown;
      RhythmExtractor2013: (signal: unknown) => { bpm: number; ticks: unknown };
      vectorToArray: (v: unknown) => Float32Array;
    };
    const channelData = buffer.getChannelData(0);
    const inputSignal = essentia.arrayToVector(channelData);
    const result = essentia.RhythmExtractor2013(inputSignal);
    const bpm = result.bpm;
    const beats = Array.from(essentia.vectorToArray(result.ticks));
    return { bpm, beats };
  },
};

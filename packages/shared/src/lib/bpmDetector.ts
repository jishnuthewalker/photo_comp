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
    // ready signals WASM init complete; the loader object itself is the wasm module
    await EssentiaWASMLoader.ready;
    essentiaInstance = new (Essentia as new (wasm: unknown) => unknown)(EssentiaWASMLoader);
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

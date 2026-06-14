import { Essentia, EssentiaWASM } from "essentia.js";

export interface IBpmDetector {
  detect(buffer: AudioBuffer): Promise<{ bpm: number; beats: number[] }>;
}

let essentiaInstance: InstanceType<typeof Essentia> | null = null;

async function getEssentia(): Promise<InstanceType<typeof Essentia>> {
  if (!essentiaInstance) {
    const wasmModule = await (EssentiaWASM as unknown as () => Promise<unknown>)();
    essentiaInstance = new Essentia(wasmModule);
  }
  return essentiaInstance;
}

export const EssentiaBpmDetector: IBpmDetector = {
  async detect(buffer: AudioBuffer) {
    const essentia = await getEssentia();
    const channelData = buffer.getChannelData(0);
    const inputSignal = essentia.arrayToVector(channelData);
    const result = essentia.RhythmExtractor2013(inputSignal);
    const bpm = result.bpm as number;
    const beats = Array.from(essentia.vectorToArray(result.ticks) as Float32Array);
    return { bpm, beats };
  },
};

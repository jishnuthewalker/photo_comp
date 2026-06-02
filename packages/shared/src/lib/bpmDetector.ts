import { Essentia, EssentiaWASM } from "essentia.js";

export interface IBpmDetector {
  detect(buffer: AudioBuffer): Promise<{ bpm: number; beats: number[] }>;
}

let essentiaInstance: InstanceType<typeof Essentia> | null = null;

function getEssentia(): InstanceType<typeof Essentia> {
  if (!essentiaInstance) {
    essentiaInstance = new Essentia(EssentiaWASM);
  }
  return essentiaInstance;
}

export const EssentiaBpmDetector: IBpmDetector = {
  async detect(buffer: AudioBuffer) {
    const essentia = getEssentia();
    const channelData = buffer.getChannelData(0);
    const inputSignal = essentia.arrayToVector(channelData);
    const result = essentia.RhythmExtractor2013(inputSignal);
    const bpm = result.bpm as number;
    const beats = Array.from(essentia.vectorToArray(result.ticks) as Float32Array);
    return { bpm, beats };
  },
};

export interface IBpmDetector {
  detect(buffer: AudioBuffer): Promise<{ bpm: number; beats: number[] }>;
}

export const EssentiaBpmDetector: IBpmDetector = {
  async detect(buffer: AudioBuffer) {
    const { default: MusicTempo } = await import("music-tempo");
    const channelData = buffer.getChannelData(0);
    const mt = new MusicTempo(channelData, { sampleRate: buffer.sampleRate });
    return { bpm: mt.tempo, beats: Array.from(mt.beats as number[]) };
  },
};

declare module "music-tempo" {
  export default class MusicTempo {
    constructor(data: Float32Array, options?: { sampleRate?: number });
    tempo: number;
    beats: number[];
  }
}

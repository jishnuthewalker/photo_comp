export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:3";
export type Alignment = "center" | "top" | "bottom" | "left" | "right";
export type Transition = "cut" | "crossfade";
export type Resolution = "720p" | "1080p" | "4k";
export type Fps = 24 | 30 | 60;

export interface Photo {
  id: string;
  originalPath: string;
  thumbPath: string;
  beatsOverride?: number; // undefined = use project.beatsPerPhoto
}

export interface AudioFile {
  path: string;
  durationMs: number;
}

export interface OutputConfig {
  format: "mp4";
  resolution: Resolution;
  fps: Fps;
}

export interface Project {
  schemaVersion: 1;
  id: string;
  name: string;
  photos: Photo[];
  bpm: number;
  firstBeatOffsetMs: number;
  beatsPerPhoto: number; // float allowed, e.g. 0.5
  cropRatio: AspectRatio;
  alignment: Alignment;
  globalTransition: Transition;
  song?: AudioFile;
  outputConfig: OutputConfig;
  lastModified: number;
}

export interface RenderProgress {
  chunkIndex: number;
  totalChunks: number;
  framesEncoded: number;
}

export interface PhotoMeta {
  originalPath: string;
  thumbPath: string;
  width: number;
  height: number;
}

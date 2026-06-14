import {
  Output,
  BufferTarget,
  Mp4OutputFormat,
  WebMOutputFormat,
  CanvasSource,
  AudioBufferSource,
  QUALITY_HIGH,
  canEncodeAudio,
  canEncodeVideo,
} from "mediabunny";
import { buildFrameCounts } from "./cumulativeTimeline";
import { drawPhotoFrame } from "./frameDraw";
import { getOriginal, getSong } from "./browserMediaStore";
import type { Photo, RenderProgress } from "../store/types";

export interface BrowserRenderRequest {
  renderId: string;
  photos: Photo[];
  bpm: number;
  beatsPerPhoto: number;
  firstBeatOffsetMs: number;
  transition: "cut" | "crossfade" | "stack";
  cropRatio: "16:9" | "9:16" | "1:1" | "4:3";
  scaleMode: "cover" | "contain";
  resolution: "720p" | "1080p" | "4k";
  fps: 24 | 30 | 60;
  songPath?: string;
  totalDurationS: number;
}

export interface BrowserRenderResult {
  outputPath: string;
  success: boolean;
  fileExtension: ".mp4" | ".webm";
}

const RESOLUTION_MAP: Record<BrowserRenderRequest["resolution"], [number, number]> = {
  "720p": [1280, 720],
  "1080p": [1920, 1080],
  "4k": [3840, 2160],
};

function cropDimensions(
  width: number,
  height: number,
  cropRatio: BrowserRenderRequest["cropRatio"]
) {
  const even = (n: number) => Math.floor(n / 2) * 2;

  switch (cropRatio) {
    case "16:9": {
      const h = even(height);
      const w = even(Math.min(width, (h * 16) / 9));
      return [w, h] as const;
    }
    case "9:16": {
      const h = even(height);
      const w = even(Math.min(width, (h * 9) / 16));
      return [w, h] as const;
    }
    case "1:1": {
      const s = even(Math.min(width, height));
      return [s, s] as const;
    }
    case "4:3": {
      const h = even(height);
      const w = even(Math.min(width, (h * 4) / 3));
      return [w, h] as const;
    }
    default:
      return [even(width), even(height)] as const;
  }
}

const cancelFlags = new Map<string, boolean>();

export async function cancelBrowserRender(renderId: string): Promise<void> {
  cancelFlags.set(renderId, true);
}

function checkCancelled(renderId: string): void {
  if (cancelFlags.get(renderId)) {
    throw new Error("Render cancelled");
  }
}

function sliceAudioBuffer(full: AudioBuffer, startSeconds: number, durationSeconds: number): AudioBuffer {
  const sampleRate = full.sampleRate;
  const startSample = Math.floor(startSeconds * sampleRate);
  const samples = Math.max(1, Math.floor(durationSeconds * sampleRate));
  const sliced = new AudioBuffer({
    numberOfChannels: full.numberOfChannels,
    length: samples,
    sampleRate,
  });

  for (let channel = 0; channel < full.numberOfChannels; channel += 1) {
    const source = full.getChannelData(channel);
    const target = sliced.getChannelData(channel);
    target.set(source.subarray(startSample, startSample + samples));
  }

  return sliced;
}

function downloadBuffer(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], { type: filename.endsWith(".webm") ? "video/webm" : "video/mp4" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

type RenderProfile = {
  format: Mp4OutputFormat | WebMOutputFormat;
  videoCodec: "avc" | "vp9" | "vp8";
  audioCodec: "aac" | "opus";
};

async function pickRenderProfile(
  width: number,
  height: number,
  fps: BrowserRenderRequest["fps"]
): Promise<RenderProfile> {
  const profiles: RenderProfile[] = [
    { format: new Mp4OutputFormat(), videoCodec: "avc", audioCodec: "aac" },
    { format: new WebMOutputFormat(), videoCodec: "vp9", audioCodec: "opus" },
    { format: new WebMOutputFormat(), videoCodec: "vp8", audioCodec: "opus" },
  ];

  for (const profile of profiles) {
    const videoSupported = await canEncodeVideo(profile.videoCodec, {
      width,
      height,
      bitrate: QUALITY_HIGH,
    });
    if (!videoSupported) {
      continue;
    }

    const audioSupported = await canEncodeAudio(profile.audioCodec, {
      sampleRate: 48_000,
      numberOfChannels: 2,
      bitrate: QUALITY_HIGH,
    });
    if (!audioSupported) {
      continue;
    }

    if (typeof VideoEncoder !== "undefined") {
      const codecString =
        profile.videoCodec === "avc"
          ? "avc1.42001f"
          : profile.videoCodec === "vp9"
            ? "vp09.00.10.08"
            : "vp8";
      const support = await VideoEncoder.isConfigSupported({
        codec: codecString,
        width,
        height,
        framerate: fps,
      });
      if (!support.supported) {
        continue;
      }
    }

    return profile;
  }

  throw new Error(
    "No supported browser video encoder was found. Enable hardware acceleration or try a browser with WebCodecs support."
  );
}

export async function renderBrowserVideo(
  req: BrowserRenderRequest,
  onProgress: (p: RenderProgress) => void
): Promise<BrowserRenderResult> {
  const {
    renderId,
    photos,
    bpm,
    beatsPerPhoto,
    firstBeatOffsetMs,
    fps,
    transition,
    cropRatio,
    scaleMode,
    resolution,
    totalDurationS,
    songPath,
  } = req;

  cancelFlags.delete(renderId);

  const [baseWidth, baseHeight] = RESOLUTION_MAP[resolution] ?? RESOLUTION_MAP["1080p"];
  const [width, height] = cropDimensions(baseWidth, baseHeight, cropRatio);

  const profile = await pickRenderProfile(width, height, fps);

  const frameCounts = buildFrameCounts(photos, bpm, beatsPerPhoto, firstBeatOffsetMs, fps);
  const totalPhotoFrames = frameCounts.reduce((sum, count) => sum + count, 0);
  const fadeFrames = transition === "crossfade" ? Math.max(1, Math.floor(fps / 4)) : 0;

  const startFrames: number[] = [];
  let cursor = 0;
  for (let index = 0; index < photos.length; index += 1) {
    startFrames[index] = cursor;
    const advance = index < photos.length - 1 ? Math.max(1, frameCounts[index] - fadeFrames) : frameCounts[index];
    cursor += advance;
  }

  const totalOutputFrames =
    transition === "crossfade"
      ? totalPhotoFrames - fadeFrames * Math.max(0, photos.length - 1)
      : totalPhotoFrames;

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Browser canvas context unavailable");
  }

  const output = new Output({
    format: profile.format,
    target: new BufferTarget(),
  });

  const videoSource = new CanvasSource(canvas, {
    codec: profile.videoCodec,
    bitrate: QUALITY_HIGH,
  });
  output.addVideoTrack(videoSource);

  let audioSource: AudioBufferSource | null = null;
  let slicedAudio: AudioBuffer | null = null;

  if (songPath) {
    const songBlob = await getSong(songPath);
    if (songBlob) {
      const audioContext = new AudioContext();
      const arrayBuffer = await songBlob.arrayBuffer();
      const fullBuffer = await audioContext.decodeAudioData(arrayBuffer);
      await audioContext.close();
      slicedAudio = sliceAudioBuffer(fullBuffer, firstBeatOffsetMs / 1000, totalDurationS);
      audioSource = new AudioBufferSource({ codec: profile.audioCodec, bitrate: QUALITY_HIGH });
      output.addAudioTrack(audioSource);
    }
  }

  await output.start();

  if (audioSource && slicedAudio) {
    await audioSource.add(slicedAudio);
  }

  let currentBitmap: ImageBitmap | null = null;
  let currentBitmapIndex = -1;

  async function getBitmapForPhoto(index: number): Promise<ImageBitmap> {
    if (currentBitmapIndex === index && currentBitmap) {
      return currentBitmap;
    }

    if (currentBitmap) {
      currentBitmap.close();
      currentBitmap = null;
    }

    const blob = await getOriginal(photos[index].originalPath);
    if (!blob) {
      throw new Error(`Photo not found in storage: ${photos[index].originalPath}`);
    }

    const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
    currentBitmap = bitmap;
    currentBitmapIndex = index;
    return bitmap;
  }

  const totalChunks = photos.length;
  let lastReportedPhotoIndex = -1;

  for (let frame = 0; frame < totalOutputFrames; frame += 1) {
    checkCancelled(renderId);

    const time = frame / fps;
    const delta = 1 / fps;

    let photoIndex = 0;
    for (let index = photos.length - 1; index >= 0; index -= 1) {
      if (frame >= startFrames[index]) {
        photoIndex = index;
        break;
      }
    }

    let inTransition = false;
    let transitionAlpha = 0;
    let nextPhotoIndex = -1;

    if (transition === "crossfade" && photoIndex < photos.length - 1) {
      const nextStart = startFrames[photoIndex + 1];
      if (frame >= nextStart) {
        inTransition = true;
        nextPhotoIndex = photoIndex + 1;
        transitionAlpha = Math.min(1, Math.max(0, (frame - nextStart) / fadeFrames));
      }
    }

    const bitmap = await getBitmapForPhoto(photoIndex);

    if (transition === "stack") {
      drawPhotoFrame(ctx, bitmap, {
        canvasW: width,
        canvasH: height,
        scaleMode,
        transition: "stack",
        alpha: 1,
      });
    } else if (inTransition && nextPhotoIndex >= 0) {
      const nextBlob = await getOriginal(photos[nextPhotoIndex].originalPath);
      if (!nextBlob) {
        throw new Error(`Photo not found in storage: ${photos[nextPhotoIndex].originalPath}`);
      }
      const nextBitmap = await createImageBitmap(nextBlob, { imageOrientation: "from-image" });

      drawPhotoFrame(ctx, bitmap, {
        canvasW: width,
        canvasH: height,
        scaleMode,
        transition: "cut",
        alpha: 1 - transitionAlpha,
      });
      drawPhotoFrame(ctx, nextBitmap, {
        canvasW: width,
        canvasH: height,
        scaleMode,
        transition: "stack",
        alpha: transitionAlpha,
      });

      nextBitmap.close();
    } else {
      drawPhotoFrame(ctx, bitmap, {
        canvasW: width,
        canvasH: height,
        scaleMode,
        transition: "cut",
        alpha: 1,
      });
    }

    await videoSource.add(time, delta);

    if (frame % 10 === 0 || photoIndex !== lastReportedPhotoIndex) {
      lastReportedPhotoIndex = photoIndex;
      onProgress({
        chunkIndex: photoIndex,
        totalChunks,
        framesEncoded: frame + 1,
      });
    }
  }

  const bitmapToClose = currentBitmap as { close?: () => void } | null;
  if (bitmapToClose) {
    bitmapToClose.close?.();
  }

  await output.finalize();
  cancelFlags.delete(renderId);

  const bufferTarget = output.target as BufferTarget;
  const buffer = bufferTarget.buffer;
  if (!buffer) {
    throw new Error("Render produced no output buffer");
  }

  const fileExtension = output.format.fileExtension as ".mp4" | ".webm";
  downloadBuffer(buffer, `framecut-export${fileExtension}`);
  return { outputPath: "", success: true, fileExtension };
}

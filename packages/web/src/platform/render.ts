import {
  Output,
  BufferTarget,
  Mp4OutputFormat,
  CanvasSource,
  AudioBufferSource,
  QUALITY_HIGH,
} from "mediabunny";
import type { RenderRequest, RenderResult } from "@framecut/shared/lib/platform";
import type { RenderProgress } from "@framecut/shared/store/types";
import { buildFrameCounts } from "@framecut/shared/lib/cumulativeTimeline";
import { drawPhotoFrame } from "@framecut/shared/lib/frameDraw";
import { getOriginal, getSong } from "./idb";

const RESOLUTION_MAP: Record<string, [number, number]> = {
  "720p": [1280, 720],
  "1080p": [1920, 1080],
  "4k": [3840, 2160],
};

const cancelFlags = new Map<string, boolean>();

export async function cancelRender(renderId: string): Promise<void> {
  cancelFlags.set(renderId, true);
}

function checkCancelled(renderId: string): void {
  if (cancelFlags.get(renderId)) throw new Error("Render cancelled");
}

function sliceAudioBuffer(
  full: AudioBuffer,
  startSeconds: number,
  durationSeconds: number
): AudioBuffer {
  const sr = full.sampleRate;
  const startSample = Math.floor(startSeconds * sr);
  const numSamples = Math.max(1, Math.floor(durationSeconds * sr));
  const sliced = new AudioBuffer({
    numberOfChannels: full.numberOfChannels,
    length: numSamples,
    sampleRate: sr,
  });
  for (let ch = 0; ch < full.numberOfChannels; ch++) {
    const src = full.getChannelData(ch);
    const dst = sliced.getChannelData(ch);
    dst.set(src.subarray(startSample, startSample + numSamples));
  }
  return sliced;
}

function downloadBuffer(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], { type: "video/mp4" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function renderVideo(
  req: RenderRequest,
  onProgress: (p: RenderProgress) => void
): Promise<RenderResult> {
  const {
    renderId,
    photos,
    bpm,
    beatsPerPhoto,
    firstBeatOffsetMs,
    fps,
    transition,
    scaleMode,
    resolution,
    totalDurationS,
    songRef,
  } = req;

  cancelFlags.delete(renderId);

  // Browser WebCodecs support check
  if (typeof VideoEncoder !== "undefined") {
    const support = await VideoEncoder.isConfigSupported({
      codec: "avc1.42001f",
      width: 1280,
      height: 720,
      framerate: fps,
    });
    if (!support.supported) {
      throw new Error(
        "WebCodecs H.264 encoding not supported. Please use Chrome or Edge."
      );
    }
  }

  const [width, height] = RESOLUTION_MAP[resolution] ?? [1280, 720];
  const frameCounts = buildFrameCounts(
    photos,
    bpm,
    beatsPerPhoto,
    firstBeatOffsetMs,
    fps
  );
  const totalPhotoFrames = frameCounts.reduce((a, b) => a + b, 0);

  // Compute per-photo start frames (with optional crossfade overlap)
  const fade_frames =
    transition === "crossfade" ? Math.max(1, Math.floor(fps / 4)) : 0;
  const startFrames: number[] = [];
  let cursor = 0;
  for (let i = 0; i < photos.length; i++) {
    startFrames[i] = cursor;
    // Clamp segment advance to at least 1 frame so cursor always moves forward
    const advance = i < photos.length - 1
      ? Math.max(1, frameCounts[i] - fade_frames)
      : frameCounts[i];
    cursor += advance;
  }
  const totalOutputFrames =
    transition === "crossfade"
      ? totalPhotoFrames - fade_frames * Math.max(0, photos.length - 1)
      : totalPhotoFrames;

  // Create OffscreenCanvas for rendering (supported by mediabunny CanvasSource)
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;

  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget(),
  });

  const videoSource = new CanvasSource(canvas, {
    codec: "avc",
    bitrate: QUALITY_HIGH,
  });
  output.addVideoTrack(videoSource);

  // Set up audio if song provided
  let audioSource: AudioBufferSource | null = null;
  let slicedAudio: AudioBuffer | null = null;

  if (songRef) {
    const songBlob = await getSong(songRef.ref);
    if (songBlob) {
      const audioCtx = new AudioContext();
      const arrayBuffer = await songBlob.arrayBuffer();
      const fullBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      await audioCtx.close();
      slicedAudio = sliceAudioBuffer(
        fullBuffer,
        firstBeatOffsetMs / 1000,
        totalDurationS
      );
      audioSource = new AudioBufferSource({ codec: "aac", bitrate: QUALITY_HIGH });
      output.addAudioTrack(audioSource);
    }
  }

  await output.start();

  // Add audio after start() to ensure buffer is ready
  if (audioSource && slicedAudio) {
    await audioSource.add(slicedAudio);
  }

  // Frame rendering loop
  // Bitmap cache: keep at most the current photo's bitmap loaded
  let currBitmap: ImageBitmap | null = null as ImageBitmap | null;
  let currPhotoIdx = -1;

  async function getBitmapForPhoto(idx: number): Promise<ImageBitmap> {
    if (currPhotoIdx === idx && currBitmap !== null) {
      return currBitmap;
    }
    // Close the old bitmap before loading a new one
    if (currBitmap !== null) {
      currBitmap.close();
      currBitmap = null;
    }
    const blob = await getOriginal(photos[idx].originalPath);
    if (!blob) {
      throw new Error(
        `Photo not found in storage: ${photos[idx].originalPath}`
      );
    }
    const bitmap = await createImageBitmap(blob, {
      imageOrientation: "from-image",
    });
    currBitmap = bitmap;
    currPhotoIdx = idx;
    return bitmap;
  }

  const totalChunks = photos.length;
  let lastReportedPhotoIdx = -1;

  for (let f = 0; f < totalOutputFrames; f++) {
    checkCancelled(renderId);

    const t = f / fps;
    const dt = 1 / fps;

    // Find which photo covers this frame (last photo whose startFrame <= f)
    let photoIdx = 0;
    for (let i = photos.length - 1; i >= 0; i--) {
      if (f >= startFrames[i]) {
        photoIdx = i;
        break;
      }
    }

    // Determine if we're in a crossfade transition zone
    let inTransition = false;
    let transitionAlpha = 0;
    let nextPhotoIdx = -1;

    if (transition === "crossfade" && photoIdx < photos.length - 1) {
      const nextStart = startFrames[photoIdx + 1];
      if (f >= nextStart) {
        inTransition = true;
        nextPhotoIdx = photoIdx + 1;
        transitionAlpha = Math.min(1, Math.max(0, (f - nextStart) / fade_frames));
      }
    }

    // Load current photo bitmap
    const bitmap = await getBitmapForPhoto(photoIdx);

    if (transition === "stack") {
      // Stack: accumulate without clearing
      drawPhotoFrame(ctx, bitmap, {
        canvasW: width,
        canvasH: height,
        scaleMode,
        transition: "stack",
        alpha: 1,
      });
    } else if (inTransition && nextPhotoIdx >= 0) {
      // Crossfade: draw current at (1-alpha), next at alpha on top
      // Load next photo bitmap temporarily (don't cache it as current)
      const nextBlob = await getOriginal(photos[nextPhotoIdx].originalPath);
      if (!nextBlob) {
        throw new Error(
          `Photo not found in storage: ${photos[nextPhotoIdx].originalPath}`
        );
      }
      const nextBitmap = await createImageBitmap(nextBlob, {
        imageOrientation: "from-image",
      });

      // Draw current photo with clear (sets black background)
      drawPhotoFrame(ctx, bitmap, {
        canvasW: width,
        canvasH: height,
        scaleMode,
        transition: "cut",
        alpha: 1 - transitionAlpha,
      });
      // Draw next photo on top without clearing (stack mode)
      drawPhotoFrame(ctx, nextBitmap, {
        canvasW: width,
        canvasH: height,
        scaleMode,
        transition: "stack",
        alpha: transitionAlpha,
      });

      nextBitmap.close();
    } else {
      // Cut: clear to black and draw
      drawPhotoFrame(ctx, bitmap, {
        canvasW: width,
        canvasH: height,
        scaleMode,
        transition: "cut",
        alpha: 1,
      });
    }

    await videoSource.add(t, dt);

    // Emit progress every 10 frames or when the photo index changes
    if (f % 10 === 0 || photoIdx !== lastReportedPhotoIdx) {
      lastReportedPhotoIdx = photoIdx;
      onProgress({
        chunkIndex: photoIdx,
        totalChunks,
        framesEncoded: f + 1,
      });
    }
  }

  // Clean up the cached bitmap
  if (currBitmap !== null) {
    currBitmap.close();
    currBitmap = null;
  }

  await output.finalize();
  cancelFlags.delete(renderId);

  // Retrieve the buffer and trigger a browser download
  const bufferTarget = output.target as BufferTarget;
  const buffer = bufferTarget.buffer;
  if (!buffer) {
    throw new Error("Render produced no output buffer");
  }
  downloadBuffer(buffer, "framecut-export.mp4");

  return { outputPath: "", success: true };
}

import { useRef, useEffect, useCallback } from "react";
import { buildCumulativeTimeline, binarySearchLE } from "../lib/cumulativeTimeline";
import type { Photo } from "../store/types";
import type { AudioEngine } from "./useAudioEngine";

interface Options {
  photos: Photo[];
  bpm: number;
  beatsPerPhoto: number;
  firstBeatOffsetMs: number;
  audioEngine: AudioEngine;
  onPhotoChange: (index: number) => void;
}

export function usePreviewSync({
  photos,
  bpm,
  beatsPerPhoto,
  firstBeatOffsetMs,
  audioEngine,
  onPhotoChange,
}: Options) {
  const rafRef = useRef<number>(0);
  const currentIdxRef = useRef<number>(-1);
  const timesRef = useRef<number[]>([]);
  const totalEndRef = useRef<number>(Infinity);

  // Recompute timeline whenever inputs change
  useEffect(() => {
    const times = buildCumulativeTimeline(photos, bpm, beatsPerPhoto, firstBeatOffsetMs);
    timesRef.current = times;
    if (times.length > 0) {
      const last = photos[times.length - 1];
      const beatDuration = 60 / bpm;
      totalEndRef.current = times[times.length - 1] + beatDuration * (last?.beatsOverride ?? beatsPerPhoto);
    } else {
      totalEndRef.current = Infinity;
    }
  }, [photos, bpm, beatsPerPhoto, firstBeatOffsetMs]);

  const loop = useCallback(() => {
    const t = audioEngine.currentTime();
    const times = timesRef.current;
    if (times.length > 0) {
      // Loop: when audio passes end of last photo, seek back to start of timeline
      if (t >= totalEndRef.current) {
        audioEngine.seek(firstBeatOffsetMs / 1000);
        currentIdxRef.current = -1;
      } else {
        const idx = Math.min(binarySearchLE(times, t), photos.length - 1);
        if (idx !== currentIdxRef.current) {
          currentIdxRef.current = idx;
          onPhotoChange(idx);
        }
      }
    }
    rafRef.current = requestAnimationFrame(loop);
  }, [audioEngine, photos.length, firstBeatOffsetMs, onPhotoChange]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [loop]);
}

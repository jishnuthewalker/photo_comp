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

  // Recompute timeline whenever inputs change
  useEffect(() => {
    timesRef.current = buildCumulativeTimeline(photos, bpm, beatsPerPhoto, firstBeatOffsetMs);
  }, [photos, bpm, beatsPerPhoto, firstBeatOffsetMs]);

  const loop = useCallback(() => {
    const t = audioEngine.currentTime();
    const times = timesRef.current;
    if (times.length > 0) {
      // During pre-roll (t < times[0]) show photo 0 — no blank period
      const idx = Math.min(binarySearchLE(times, t), photos.length - 1);
      if (idx !== currentIdxRef.current) {
        currentIdxRef.current = idx;
        onPhotoChange(idx);
      }
    }
    rafRef.current = requestAnimationFrame(loop);
  }, [audioEngine, photos.length, onPhotoChange]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [loop]);
}

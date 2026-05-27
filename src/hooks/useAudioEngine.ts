import { useRef, useCallback, useState } from "react";

export interface AudioEngine {
  load: (filePath: string) => Promise<number>; // returns durationMs
  play: (fromSeconds?: number) => void;
  pause: () => void;
  seek: (toSeconds: number) => void;
  currentTime: () => number;
  duration: number;
  isPlaying: boolean;
  audioBuffer: AudioBuffer | null;
}

export function useAudioEngine(): AudioEngine {
  const contextRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);   // audioContext.currentTime when play started
  const offsetRef = useRef<number>(0);      // offset into buffer when play started
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);

  const getContext = useCallback(() => {
    if (!contextRef.current || contextRef.current.state === "closed") {
      contextRef.current = new AudioContext();
    }
    return contextRef.current;
  }, []);

  const load = useCallback(async (filePath: string): Promise<number> => {
    const ctx = getContext();
    // Tauri asset protocol for local files
    const { convertFileSrc } = await import("@tauri-apps/api/core");
    const url = convertFileSrc(filePath);
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    bufferRef.current = decoded;
    setAudioBuffer(decoded);
    setDuration(decoded.duration);
    return decoded.duration * 1000; // return durationMs directly — don't read React state
  }, [getContext]);

  const play = useCallback((fromSeconds = 0) => {
    const ctx = getContext();
    const buf = bufferRef.current;
    if (!buf) return;
    sourceRef.current?.stop();
    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.connect(ctx.destination);
    source.start(0, fromSeconds);
    source.onended = () => setIsPlaying(false);
    sourceRef.current = source;
    startTimeRef.current = ctx.currentTime;
    offsetRef.current = fromSeconds;
    setIsPlaying(true);
  }, [getContext]);

  const pause = useCallback(() => {
    sourceRef.current?.stop();
    offsetRef.current += (contextRef.current?.currentTime ?? 0) - startTimeRef.current;
    setIsPlaying(false);
  }, []);

  const seek = useCallback((toSeconds: number) => {
    const wasPlaying = isPlaying;
    if (isPlaying) {
      sourceRef.current?.stop();
    }
    offsetRef.current = toSeconds;
    if (wasPlaying) play(toSeconds);
  }, [isPlaying, play]);

  const currentTime = useCallback((): number => {
    if (!isPlaying) return offsetRef.current;
    return offsetRef.current + ((contextRef.current?.currentTime ?? 0) - startTimeRef.current);
  }, [isPlaying]);

  return { load, play, pause, seek, currentTime, duration, isPlaying, audioBuffer };
}

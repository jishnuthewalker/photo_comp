import { useRef, useCallback, useState } from "react";

export interface AudioEngine {
  load: (bytes: ArrayBuffer) => Promise<number>; // returns durationMs
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
  const isPlayingRef = useRef(false);
  const [duration, setDuration] = useState(0);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);

  const getContext = useCallback(() => {
    if (!contextRef.current || contextRef.current.state === "closed") {
      contextRef.current = new AudioContext();
    }
    return contextRef.current;
  }, []);

  const load = useCallback(async (bytes: ArrayBuffer): Promise<number> => {
    const ctx = getContext();
    const decoded = await ctx.decodeAudioData(bytes.slice(0));
    bufferRef.current = decoded;
    setAudioBuffer(decoded);
    setDuration(decoded.duration);
    return decoded.duration * 1000;
  }, [getContext]);

  const play = useCallback((fromSeconds = 0) => {
    const ctx = getContext();
    const buf = bufferRef.current;
    if (!buf) return;
    if (sourceRef.current) {
      sourceRef.current.onended = null;
      sourceRef.current.stop();
    }
    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.connect(ctx.destination);
    source.start(0, fromSeconds);
    source.onended = () => { isPlayingRef.current = false; setIsPlaying(false); };
    sourceRef.current = source;
    startTimeRef.current = ctx.currentTime;
    offsetRef.current = fromSeconds;
    isPlayingRef.current = true;
    setIsPlaying(true);
  }, [getContext]);

  const pause = useCallback(() => {
    if (!isPlayingRef.current) return;
    if (sourceRef.current) {
      sourceRef.current.onended = null;
      sourceRef.current.stop();
    }
    offsetRef.current += (contextRef.current?.currentTime ?? 0) - startTimeRef.current;
    isPlayingRef.current = false;
    setIsPlaying(false);
  }, []);

  const seek = useCallback((toSeconds: number) => {
    const wasPlaying = isPlayingRef.current;
    if (isPlayingRef.current) {
      if (sourceRef.current) { sourceRef.current.onended = null; sourceRef.current.stop(); }
      isPlayingRef.current = false;
      setIsPlaying(false);
    }
    offsetRef.current = toSeconds;
    if (wasPlaying) play(toSeconds);
  }, [play]);

  const currentTime = useCallback((): number => {
    if (!isPlayingRef.current) return offsetRef.current;
    return offsetRef.current + ((contextRef.current?.currentTime ?? 0) - startTimeRef.current);
  }, []);

  return { load, play, pause, seek, currentTime, duration, isPlaying, audioBuffer };
}

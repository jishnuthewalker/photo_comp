import { useState, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useProjectStore } from "../../store/projectStore";
import { tapTempoMedian } from "../../lib/tapTempo";
import type { AudioEngine } from "../../hooks/useAudioEngine";

interface Props {
  audioEngine: AudioEngine;
}

export function BpmControls({ audioEngine }: Props) {
  const bpm = useProjectStore((s) => s.project.bpm);
  const firstBeatOffsetMs = useProjectStore((s) => s.project.firstBeatOffsetMs);
  const setBpm = useProjectStore((s) => s.setBpm);
  const setFirstBeatOffsetMs = useProjectStore((s) => s.setFirstBeatOffsetMs);
  const setSong = useProjectStore((s) => s.setSong);
  const song = useProjectStore((s) => s.project.song);

  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const [bpmInput, setBpmInput] = useState(String(bpm));
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);

  const handleAutoDetect = async () => {
    if (!audioEngine.audioBuffer) return;
    setDetecting(true);
    setDetectError(null);
    try {
      const { EssentiaBpmDetector } = await import("../../lib/bpmDetector");
      const { bpm: detected } = await EssentiaBpmDetector.detect(audioEngine.audioBuffer);
      const rounded = Math.round(detected * 10) / 10;
      setBpm(rounded);
      setBpmInput(String(rounded));
    } catch (e) {
      setDetectError(String(e));
    } finally {
      setDetecting(false);
    }
  };

  const handleImportSong = async () => {
    const path = await open({ filters: [{ name: "Audio", extensions: ["mp3", "aac", "wav", "flac", "m4a"] }] });
    if (!path || Array.isArray(path)) return;
    const durationMs = await audioEngine.load(path);
    setSong({ path, durationMs });
  };

  const handleTap = useCallback(() => {
    const now = performance.now();
    setTapTimes((prev) => {
      const updated = [...prev, now].slice(-9);
      const detected = tapTempoMedian(updated);
      if (detected !== null) {
        const rounded = Math.round(detected * 10) / 10;
        setBpm(rounded);
        setBpmInput(String(rounded));
      }
      return updated;
    });
  }, [setBpm]);

  const handleBpmBlur = () => {
    const val = parseFloat(bpmInput);
    if (!isNaN(val) && val > 0) setBpm(val);
    else setBpmInput(String(bpm));
  };

  const handlePlay = () => {
    if (audioEngine.isPlaying) audioEngine.pause();
    else audioEngine.play(firstBeatOffsetMs / 1000);
  };

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 12px", flexWrap: "wrap" }}>
      <button onClick={handleImportSong} style={{ padding: "4px 10px", background: "#333", color: "#fff", border: "1px solid #555", borderRadius: 4, cursor: "pointer" }}>
        {song ? "Change Song" : "Import Song"}
      </button>

      {song && (
        <button onClick={handlePlay} style={{ padding: "4px 10px", background: "#333", color: "#fff", border: "1px solid #555", borderRadius: 4, cursor: "pointer" }}>
          {audioEngine.isPlaying ? "⏸" : "▶"}
        </button>
      )}

      <label style={{ color: "#aaa", fontSize: 13 }}>
        BPM:
        <input
          type="number"
          value={bpmInput}
          step="0.1"
          min="1"
          onChange={(e) => setBpmInput(e.target.value)}
          onBlur={handleBpmBlur}
          style={{ width: 70, marginLeft: 6, background: "#222", color: "#fff", border: "1px solid #444", borderRadius: 4, padding: "2px 6px" }}
        />
      </label>

      <button onClick={handleTap} style={{ padding: "4px 14px", background: "#333", color: "#fff", border: "1px solid #555", borderRadius: 4, cursor: "pointer" }}>
        Tap
      </button>

      {song && (
        <button onClick={handleAutoDetect} disabled={detecting} style={{ padding: "4px 10px", background: "#333", color: "#fff", border: "1px solid #555", borderRadius: 4, cursor: "pointer" }}>
          {detecting ? "Detecting…" : "Auto BPM"}
        </button>
      )}
      {detectError && <span style={{ color: "#f66", fontSize: 12 }}>{detectError}</span>}

      <label style={{ color: "#aaa", fontSize: 13 }}>
        Offset:
        <input
          type="number"
          value={firstBeatOffsetMs}
          step="10"
          onChange={(e) => setFirstBeatOffsetMs(Number(e.target.value))}
          style={{ width: 70, marginLeft: 6, background: "#222", color: "#fff", border: "1px solid #444", borderRadius: 4, padding: "2px 6px" }}
        />
        ms
      </label>
    </div>
  );
}

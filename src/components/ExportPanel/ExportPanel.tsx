import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { nanoid } from "nanoid";
import { useProjectStore } from "../../store/projectStore";
import { buildCumulativeTimeline, buildFrameCounts } from "../../lib/cumulativeTimeline";
import type { RenderProgress } from "../../store/types";

export function ExportPanel() {
  const project = useProjectStore((s) => s.project);
  const setOutputConfig = useProjectStore((s) => s.setOutputConfig);
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renderId, setRenderId] = useState<string | null>(null);

  const resolutionMap = { "720p": [1280, 720], "1080p": [1920, 1080], "4k": [3840, 2160] } as const;
  const [width, height] = resolutionMap[project.outputConfig.resolution];

  const handleRender = async () => {
    const outputPath = await save({ filters: [{ name: "MP4 Video", extensions: ["mp4"] }] });
    if (!outputPath) return;

    setError(null);
    setRendering(true);
    const id = nanoid();
    setRenderId(id);

    const frameCounts = buildFrameCounts(
      project.photos,
      project.bpm,
      project.beatsPerPhoto,
      project.firstBeatOffsetMs,
      project.outputConfig.fps
    );
    const times = buildCumulativeTimeline(
      project.photos,
      project.bpm,
      project.beatsPerPhoto,
      project.firstBeatOffsetMs
    );
    const lastTime = times[times.length - 1] ?? 0;
    const lastBeats = project.photos[project.photos.length - 1]?.beatsOverride ?? project.beatsPerPhoto;
    const totalDuration = lastTime + (60 / project.bpm) * lastBeats;

    const unlisten = await listen<RenderProgress>("render_progress", (e) => setProgress(e.payload));

    try {
      const result = await invoke<string>("render_video", {
        config: {
          renderId: id,
          outputPath,
          photos: project.photos.map((p, i) => ({ path: p.originalPath, frameCount: frameCounts[i] })),
          fps: project.outputConfig.fps,
          width,
          height,
          cropRatio: project.cropRatio,
          transition: project.globalTransition,
          songPath: project.song?.path ?? null,
          firstBeatOffsetMs: project.firstBeatOffsetMs,
          totalDurationS: totalDuration,
        },
      });
      alert(`Render complete: ${result}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setRendering(false);
      setProgress(null);
      unlisten();
    }
  };

  const handleCancel = async () => {
    if (renderId) await invoke("cancel_render", { renderId });
    setRendering(false);
    setProgress(null);
  };

  return (
    <div style={{ padding: "8px 12px", borderTop: "1px solid #222", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <select
        value={project.outputConfig.resolution}
        onChange={(e) => setOutputConfig({ ...project.outputConfig, resolution: e.target.value as any })}
        style={{ background: "#222", color: "#fff", border: "1px solid #444", borderRadius: 4, padding: "4px 8px" }}
      >
        <option value="720p">720p</option>
        <option value="1080p">1080p</option>
        <option value="4k">4K</option>
      </select>

      <select
        value={project.outputConfig.fps}
        onChange={(e) => setOutputConfig({ ...project.outputConfig, fps: Number(e.target.value) as any })}
        style={{ background: "#222", color: "#fff", border: "1px solid #444", borderRadius: 4, padding: "4px 8px" }}
      >
        <option value={24}>24fps</option>
        <option value={30}>30fps</option>
        <option value={60}>60fps</option>
      </select>

      {!rendering ? (
        <button
          onClick={handleRender}
          disabled={project.photos.length === 0}
          style={{ padding: "6px 16px", background: "#5b6eff", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}
        >
          Export MP4
        </button>
      ) : (
        <>
          <span style={{ color: "#aaa", fontSize: 13 }}>
            {progress ? `Chunk ${progress.chunkIndex + 1}/${progress.totalChunks}` : "Starting…"}
          </span>
          <button onClick={handleCancel} style={{ padding: "6px 12px", background: "#a03030", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>
            Cancel
          </button>
        </>
      )}

      {error && <span style={{ color: "#f66", fontSize: 12 }}>{error}</span>}
    </div>
  );
}

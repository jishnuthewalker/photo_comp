import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PhotoGrid } from "./components/PhotoGrid/PhotoGrid";
import { Filmstrip } from "./components/Filmstrip/Filmstrip";
import { ExportPanel } from "./components/ExportPanel/ExportPanel";
import { BpmControls } from "./components/BpmControls/BpmControls";
import { ControlsPanel } from "./components/ControlsPanel/ControlsPanel";
import { PreviewCanvas } from "./components/PreviewCanvas/PreviewCanvas";
import { useAudioEngine } from "./hooks/useAudioEngine";
import { usePreviewSync } from "./hooks/usePreviewSync";
import { useProjectStore } from "./store/projectStore";
import { buildCumulativeTimeline } from "./lib/cumulativeTimeline";
import { saveProject, loadProject as loadProjectFile } from "./lib/projectPersistence";

export default function App() {
  const [ffmpegError, setFfmpegError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [savePath, setSavePath] = useState<string | null>(null);
  const audioEngine = useAudioEngine();
  const project = useProjectStore((s) => s.project);
  const loadProjectIntoStore = useProjectStore((s) => s.loadProject);

  usePreviewSync({
    photos: project.photos,
    bpm: project.bpm,
    beatsPerPhoto: project.beatsPerPhoto,
    firstBeatOffsetMs: project.firstBeatOffsetMs,
    audioEngine,
    onPhotoChange: setActiveIndex,
  });

  const handleFilmstripClick = (index: number) => {
    const times = buildCumulativeTimeline(project.photos, project.bpm, project.beatsPerPhoto, project.firstBeatOffsetMs);
    audioEngine.seek(times[index] ?? 0);
    setActiveIndex(index);
  };

  useEffect(() => {
    invoke<void>("check_ffmpeg").catch((e: string) => setFfmpegError(e));
  }, []);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "z") useProjectStore.temporal.getState().undo();
      if (e.ctrlKey && e.key === "y") useProjectStore.temporal.getState().redo();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);

  useEffect(() => {
    if (!savePath) return;
    const timer = setTimeout(() => {
      saveProject(project, savePath).catch(console.error);
    }, 1000);
    return () => clearTimeout(timer);
  }, [project, savePath]);

  if (ffmpegError) {
    return <div style={{ padding: 32, color: "red" }}><h2>FFmpeg Error</h2><p>{ffmpegError}</p></div>;
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#111", color: "#fff" }}>
      <Filmstrip activePhotoIndex={activeIndex} onCellClick={handleFilmstripClick} />
      <BpmControls audioEngine={audioEngine} />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <PreviewCanvas photos={project.photos} activeIndex={activeIndex} />
      </div>
      <ControlsPanel />
      <div style={{ padding: 8, borderTop: "1px solid #222", display: "flex", gap: 8 }}>
        <button onClick={() => setShowImport(true)} style={{ padding: "6px 14px", background: "#5b6eff", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>
          + Import Photos
        </button>
        <button onClick={async () => {
          try {
            const path = await saveProject(project, savePath ?? undefined);
            setSavePath(path);
          } catch (e) {
            if (String(e) !== "Error: cancelled") console.error(e);
          }
        }} style={{ padding: "6px 14px", background: "#333", color: "#fff", border: "1px solid #555", borderRadius: 4, cursor: "pointer" }}>
          Save
        </button>
        <button onClick={async () => {
          try {
            const p = await loadProjectFile();
            if (p) { loadProjectIntoStore(p); setSavePath(null); }
          } catch (e) {
            console.error(e);
          }
        }} style={{ padding: "6px 14px", background: "#333", color: "#fff", border: "1px solid #555", borderRadius: 4, cursor: "pointer" }}>
          Open
        </button>
      </div>
      <ExportPanel />
      {showImport && <PhotoGrid onClose={() => setShowImport(false)} />}
    </div>
  );
}

import { useEffect, useState } from "react";
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
import { platform } from "./lib/platform";
import type { PickedFile } from "./lib/platform";

export default function App() {
  const [backendError, setBackendError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importFiles, setImportFiles] = useState<PickedFile[] | undefined>(undefined);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hasSaved, setHasSaved] = useState(false);
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

  // Check backend readiness (desktop: ffmpeg check; web: no-op)
  useEffect(() => {
    platform().checkBackendReady().catch((e: unknown) =>
      setBackendError(e instanceof Error ? e.message : String(e))
    );
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (e.ctrlKey && k === "z") { e.preventDefault(); useProjectStore.temporal.getState().undo(); }
      if (e.ctrlKey && k === "y") { e.preventDefault(); useProjectStore.temporal.getState().redo(); }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);

  // Autosave — only after user has saved once
  useEffect(() => {
    if (!hasSaved) return;
    const timer = setTimeout(() => {
      saveProject(project).catch(console.error);
    }, 1000);
    return () => clearTimeout(timer);
  }, [project, hasSaved]);

  // File drop support
  useEffect(() => {
    const unsub = platform().onFileDrop((files) => {
      setImportFiles(files);
      setShowImport(true);
    });
    return unsub;
  }, []);

  if (backendError) {
    return <div style={{ padding: 32, color: "red" }}><h2>Backend Error</h2><p>{backendError}</p></div>;
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
        <button
          onClick={() => { setImportFiles(undefined); setShowImport(true); }}
          style={{ padding: "6px 14px", background: "#5b6eff", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}
        >
          + Import Photos
        </button>
        <button
          onClick={async () => {
            try {
              await saveProject(project);
              setHasSaved(true);
            } catch (e) {
              if (String(e) !== "Error: cancelled") console.error(e);
            }
          }}
          style={{ padding: "6px 14px", background: "#333", color: "#fff", border: "1px solid #555", borderRadius: 4, cursor: "pointer" }}
        >
          Save
        </button>
        <button
          onClick={async () => {
            try {
              const p = await loadProjectFile();
              if (p) { loadProjectIntoStore(p); setHasSaved(false); }
            } catch (e) {
              console.error(e);
            }
          }}
          style={{ padding: "6px 14px", background: "#333", color: "#fff", border: "1px solid #555", borderRadius: 4, cursor: "pointer" }}
        >
          Open
        </button>
      </div>
      <ExportPanel />
      {showImport && (
        <PhotoGrid
          onClose={() => { setShowImport(false); setImportFiles(undefined); }}
          initialFiles={importFiles}
        />
      )}
    </div>
  );
}

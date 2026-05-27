import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PhotoGrid } from "./components/PhotoGrid/PhotoGrid";
import { Filmstrip } from "./components/Filmstrip/Filmstrip";
import { ExportPanel } from "./components/ExportPanel/ExportPanel";
import { BpmControls } from "./components/BpmControls/BpmControls";
import { useAudioEngine } from "./hooks/useAudioEngine";

export default function App() {
  const [ffmpegError, setFfmpegError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const audioEngine = useAudioEngine();

  useEffect(() => {
    invoke<void>("check_ffmpeg").catch((e: string) => setFfmpegError(e));
  }, []);

  if (ffmpegError) {
    return <div style={{ padding: 32, color: "red" }}><h2>FFmpeg Error</h2><p>{ffmpegError}</p></div>;
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#111", color: "#fff" }}>
      <Filmstrip activePhotoIndex={activeIndex} onCellClick={setActiveIndex} />
      <BpmControls audioEngine={audioEngine} />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
        Preview canvas — Task 11
      </div>
      <div style={{ padding: 8, borderTop: "1px solid #222" }}>
        <button onClick={() => setShowImport(true)} style={{ padding: "6px 14px", background: "#5b6eff", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>
          + Import Photos
        </button>
      </div>
      <ExportPanel />
      {showImport && <PhotoGrid onClose={() => setShowImport(false)} />}
    </div>
  );
}

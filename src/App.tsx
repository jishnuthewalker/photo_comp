import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PhotoGrid } from "./components/PhotoGrid/PhotoGrid";
import { Filmstrip } from "./components/Filmstrip/Filmstrip";

export default function App() {
  const [ffmpegError, setFfmpegError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    invoke<void>("check_ffmpeg").catch((e: string) => setFfmpegError(e));
  }, []);

  if (ffmpegError) {
    return (
      <div style={{ padding: 32, color: "red" }}>
        <h2>FFmpeg Error</h2>
        <p>{ffmpegError}</p>
        <p>Download the GPL build from: https://github.com/BtbN/FFmpeg-Builds/releases</p>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#111", color: "#fff" }}>
      <Filmstrip activePhotoIndex={activeIndex} onCellClick={setActiveIndex} />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>
        Preview canvas — Task 11
      </div>
      <div style={{ padding: 8, borderTop: "1px solid #222" }}>
        <button onClick={() => setShowImport(true)} style={{ padding: "6px 14px", background: "#5b6eff", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>
          + Import Photos
        </button>
      </div>
      {showImport && <PhotoGrid onClose={() => setShowImport(false)} />}
    </div>
  );
}

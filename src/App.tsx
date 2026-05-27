import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PhotoGrid } from "./components/PhotoGrid/PhotoGrid";

export default function App() {
  const [ffmpegError, setFfmpegError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

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
      <button onClick={() => setShowImport(true)} style={{ margin: 16, alignSelf: "flex-start", padding: "8px 16px", background: "#5b6eff", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>
        Import Photos
      </button>
      {showImport && <PhotoGrid onClose={() => setShowImport(false)} />}
    </div>
  );
}

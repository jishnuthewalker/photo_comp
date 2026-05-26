import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export default function App() {
  const [ffmpegError, setFfmpegError] = useState<string | null>(null);

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

  return <div style={{ height: "100vh", background: "#111", color: "#fff" }}>PhotosCompilation — loading</div>;
}

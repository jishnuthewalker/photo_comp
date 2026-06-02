import { useState, useEffect } from "react";
import { useProjectStore } from "../../store/projectStore";

export function ControlsPanel() {
  const project = useProjectStore((s) => s.project);
  const setCropRatio = useProjectStore((s) => s.setCropRatio);
  const setAlignment = useProjectStore((s) => s.setAlignment);
  const setScaleMode = useProjectStore((s) => s.setScaleMode);
  const setBeatsPerPhoto = useProjectStore((s) => s.setBeatsPerPhoto);
  const setGlobalTransition = useProjectStore((s) => s.setGlobalTransition);

  // "X photos per Y beats" UI — stored as beatsPerPhoto = Y/X
  const [photosInput, setPhotosInput] = useState("1");
  const [beatsInput, setBeatsInput] = useState(String(project.beatsPerPhoto));

  // Sync display when store changes externally (undo/load)
  useEffect(() => {
    setBeatsInput(String(project.beatsPerPhoto));
    setPhotosInput("1");
  }, [project.beatsPerPhoto]);

  const commitRatio = (photosStr: string, beatsStr: string) => {
    const photos = parseFloat(photosStr);
    const beats = parseFloat(beatsStr);
    if (!isNaN(photos) && photos > 0 && !isNaN(beats) && beats > 0) {
      setBeatsPerPhoto(beats / photos);
    }
  };

  const inputStyle = {
    width: 44,
    background: "#222",
    color: "#fff",
    border: "1px solid #444",
    borderRadius: 4,
    padding: "3px 6px",
    textAlign: "center" as const,
  };

  const selectStyle = {
    background: "#222",
    color: "#fff",
    border: "1px solid #444",
    borderRadius: 4,
    padding: "3px 8px",
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        padding: "8px 12px",
        alignItems: "center",
        flexWrap: "wrap",
        borderTop: "1px solid #1e1e1e",
      }}
    >
      <label
        style={{ color: "#aaa", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}
      >
        Crop:
        <select
          value={project.cropRatio}
          onChange={(e) => setCropRatio(e.target.value as any)}
          style={selectStyle}
        >
          <option value="16:9">16:9</option>
          <option value="9:16">9:16</option>
          <option value="1:1">1:1</option>
          <option value="4:3">4:3</option>
        </select>
      </label>

      <label
        style={{ color: "#aaa", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}
      >
        Scale:
        <select
          value={project.scaleMode}
          onChange={(e) => setScaleMode(e.target.value as any)}
          style={selectStyle}
        >
          <option value="cover">Fill</option>
          <option value="contain">Fit</option>
        </select>
      </label>

      <label
        style={{ color: "#aaa", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}
      >
        Align:
        <select
          value={project.alignment}
          onChange={(e) => setAlignment(e.target.value as any)}
          style={selectStyle}
        >
          <option value="center">Center</option>
          <option value="top">Top</option>
          <option value="bottom">Bottom</option>
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
      </label>

      <div style={{ color: "#aaa", fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
        <input
          type="number"
          min="1"
          step="1"
          value={photosInput}
          onChange={(e) => setPhotosInput(e.target.value)}
          onBlur={() => commitRatio(photosInput, beatsInput)}
          style={inputStyle}
        />
        <span>photos per</span>
        <input
          type="number"
          min="0.25"
          step="0.25"
          value={beatsInput}
          onChange={(e) => setBeatsInput(e.target.value)}
          onBlur={() => commitRatio(photosInput, beatsInput)}
          style={inputStyle}
        />
        <span>beats</span>
      </div>

      <label
        style={{ color: "#aaa", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}
      >
        Transition:
        <select
          value={project.globalTransition}
          onChange={(e) => setGlobalTransition(e.target.value as any)}
          style={selectStyle}
        >
          <option value="cut">Hard cut</option>
          <option value="crossfade">Crossfade</option>
          <option value="stack">Stack</option>
        </select>
      </label>
    </div>
  );
}

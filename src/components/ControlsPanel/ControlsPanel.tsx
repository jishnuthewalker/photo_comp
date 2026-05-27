import { useState } from "react";
import { useProjectStore } from "../../store/projectStore";

export function ControlsPanel() {
  const project = useProjectStore((s) => s.project);
  const setCropRatio = useProjectStore((s) => s.setCropRatio);
  const setAlignment = useProjectStore((s) => s.setAlignment);
  const setBeatsPerPhoto = useProjectStore((s) => s.setBeatsPerPhoto);
  const setGlobalTransition = useProjectStore((s) => s.setGlobalTransition);

  const [beatsInput, setBeatsInput] = useState(String(project.beatsPerPhoto));

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

      <label
        style={{ color: "#aaa", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}
      >
        Beats/photo:
        <input
          type="number"
          min="0.25"
          step="0.25"
          value={beatsInput}
          onChange={(e) => setBeatsInput(e.target.value)}
          onBlur={() => {
            const v = parseFloat(beatsInput);
            if (!isNaN(v) && v > 0) {
              setBeatsPerPhoto(v);
            } else {
              setBeatsInput(String(project.beatsPerPhoto));
            }
          }}
          style={{
            width: 60,
            background: "#222",
            color: "#fff",
            border: "1px solid #444",
            borderRadius: 4,
            padding: "3px 6px",
          }}
        />
      </label>

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
        </select>
      </label>
    </div>
  );
}

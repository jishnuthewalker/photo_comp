import { useRef, useEffect, useLayoutEffect, useState } from "react";
import { useProjectStore } from "../../store/projectStore";

interface Props {
  x: number;
  y: number;
  onClose: () => void;
  onArrangeByFilename: () => void;
  onAnalyzeDuplicates: () => void;
}

export function CellContextMenu({ x, y, onClose, onArrangeByFilename, onAnalyzeDuplicates }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [beatsInput, setBeatsInput] = useState("");
  const [showBeatsInput, setShowBeatsInput] = useState(false);
  const beatsInputRef = useRef<HTMLInputElement>(null);

  const setPhotosBeatsOverride = useProjectStore((s) => s.setPhotosBeatsOverride);
  const removePhotos = useProjectStore((s) => s.removePhotos);
  const duplicatePhotos = useProjectStore((s) => s.duplicatePhotos);

  // Clamp menu to viewport
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let nx = x;
    let ny = y;
    if (nx + rect.width > window.innerWidth) nx = window.innerWidth - rect.width - 4;
    if (ny + rect.height > window.innerHeight) ny = window.innerHeight - rect.height - 4;
    if (nx < 0) nx = 4;
    if (ny < 0) ny = 4;
    setPos({ x: nx, y: ny });
  }, [x, y]);

  // Focus beats input when it appears
  useEffect(() => {
    if (showBeatsInput) beatsInputRef.current?.focus();
  }, [showBeatsInput]);

  // Close on outside pointerdown or Escape
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const tid = setTimeout(() => {
      document.addEventListener("pointerdown", handlePointerDown, true);
      document.addEventListener("keydown", handleKeyDown);
    }, 0);
    return () => {
      clearTimeout(tid);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const getSelectedIds = () => [...useProjectStore.getState().selectedPhotoIds];

  const handleSetBeats = () => {
    if (!showBeatsInput) { setShowBeatsInput(true); return; }
    const v = parseFloat(beatsInput);
    if (!Number.isFinite(v) || v <= 0) return;
    setPhotosBeatsOverride(getSelectedIds(), v);
    onClose();
  };

  const handleBeatsKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      const v = parseFloat(beatsInput);
      if (Number.isFinite(v) && v > 0) { setPhotosBeatsOverride(getSelectedIds(), v); onClose(); }
    }
    if (e.key === "Escape") { setShowBeatsInput(false); setBeatsInput(""); }
  };

  const handleResetBeats = () => { setPhotosBeatsOverride(getSelectedIds(), undefined); onClose(); };
  const handleRemove = () => { removePhotos(getSelectedIds()); onClose(); };
  const handleDuplicate = () => { duplicatePhotos(getSelectedIds()); onClose(); };

  const menuStyle: React.CSSProperties = {
    position: "fixed",
    top: pos.y,
    left: pos.x,
    background: "#1e1e2e",
    border: "1px solid #444",
    borderRadius: 6,
    boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
    zIndex: 1000,
    minWidth: 180,
    padding: "4px 0",
    userSelect: "none",
  };

  const itemStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    padding: "7px 14px",
    background: "none",
    border: "none",
    color: "#e0e0f0",
    fontSize: 13,
    textAlign: "left",
    cursor: "pointer",
  };

  const dangerStyle: React.CSSProperties = { ...itemStyle, color: "#f06060" };

  const dividerStyle: React.CSSProperties = {
    height: 1,
    background: "#333",
    margin: "3px 0",
  };

  return (
    <div ref={menuRef} style={menuStyle}>
      <div>
        <button style={itemStyle} onClick={handleSetBeats}>
          Set beats…
        </button>
        {showBeatsInput && (
          <div style={{ padding: "4px 14px 8px", display: "flex", gap: 4, alignItems: "center" }}>
            <input
              ref={beatsInputRef}
              type="number"
              step={0.25}
              min={0.25}
              value={beatsInput}
              onChange={(e) => setBeatsInput(e.target.value)}
              onKeyDown={handleBeatsKeyDown}
              placeholder="e.g. 2"
              style={{
                width: 80,
                background: "#2a2a3e",
                color: "#e0e0f0",
                border: "1px solid #555",
                borderRadius: 4,
                padding: "3px 7px",
                fontSize: 13,
              }}
            />
            <button
              style={{ ...itemStyle, padding: "3px 10px", background: "#333", borderRadius: 4, border: "1px solid #555", width: "auto" }}
              onClick={() => {
                const v = parseFloat(beatsInput);
                if (Number.isFinite(v) && v > 0) { setPhotosBeatsOverride(getSelectedIds(), v); onClose(); }
              }}
            >
              OK
            </button>
          </div>
        )}
      </div>

      <div style={dividerStyle} />
      <button style={itemStyle} onClick={handleResetBeats}>Reset beats</button>
      <div style={dividerStyle} />
      <button style={itemStyle} onClick={handleDuplicate}>Duplicate</button>
      <div style={dividerStyle} />
      <button style={itemStyle} onClick={() => { onArrangeByFilename(); onClose(); }}>Arrange by filename</button>
      <button style={itemStyle} onClick={() => { onAnalyzeDuplicates(); onClose(); }}>Analyze duplicates</button>
      <div style={dividerStyle} />
      <button style={dangerStyle} onClick={handleRemove}>Remove</button>
    </div>
  );
}

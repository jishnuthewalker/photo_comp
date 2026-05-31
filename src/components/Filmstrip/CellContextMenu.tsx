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

  useEffect(() => {
    if (showBeatsInput) {
      beatsInputRef.current?.focus();
    }
  }, [showBeatsInput]);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        onClose();
      }
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
    if (!showBeatsInput) {
      setShowBeatsInput(true);
      return;
    }
    const v = parseFloat(beatsInput);
    if (!Number.isFinite(v) || v <= 0) return;
    setPhotosBeatsOverride(getSelectedIds(), v);
    onClose();
  };

  const handleBeatsKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      const v = parseFloat(beatsInput);
      if (Number.isFinite(v) && v > 0) {
        setPhotosBeatsOverride(getSelectedIds(), v);
        onClose();
      }
    }
    if (e.key === "Escape") {
      setShowBeatsInput(false);
      setBeatsInput("");
    }
  };

  const handleResetBeats = () => {
    setPhotosBeatsOverride(getSelectedIds(), undefined);
    onClose();
  };

  const handleRemove = () => {
    removePhotos(getSelectedIds());
    onClose();
  };

  const handleDuplicate = () => {
    duplicatePhotos(getSelectedIds());
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="menu"
      style={{
        top: pos.y,
        left: pos.x,
      }}
    >
      <div>
        <button className="menu-item" onClick={handleSetBeats}>
          Set beatsâ€¦
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
              className="field field--number"
            />
            <button
              className="btn"
              onClick={() => {
                const v = parseFloat(beatsInput);
                if (Number.isFinite(v) && v > 0) {
                  setPhotosBeatsOverride(getSelectedIds(), v);
                  onClose();
                }
              }}
            >
              OK
            </button>
          </div>
        )}
      </div>

      <div className="menu-divider" />

      <button className="menu-item" onClick={handleResetBeats}>
        Reset beats
      </button>

      <div className="menu-divider" />

      <button className="menu-item" onClick={handleDuplicate}>
        Duplicate
      </button>

      <div className="menu-divider" />

      <button className="menu-item" onClick={() => { onArrangeByFilename(); onClose(); }}>
        Arrange by filename
      </button>

      <button className="menu-item" onClick={() => { onAnalyzeDuplicates(); onClose(); }}>
        Analyze duplicates
      </button>

      <div className="menu-divider" />

      <button className="menu-item menu-item--danger" onClick={handleRemove}>
        Remove
      </button>
    </div>
  );
}

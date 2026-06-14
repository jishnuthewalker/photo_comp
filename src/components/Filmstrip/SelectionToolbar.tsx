import { useState } from "react";
import { useProjectStore } from "../../store/projectStore";

interface Props {
  isSelectionMode: boolean;
  setIsSelectionMode: (value: boolean) => void;
  selectedCount: number;
  analyzeDisabled: boolean;
  analyzeLoading: boolean;
  duplicateError: string | null;
  pathDuplicateCount: number;
  contentDuplicateCount: number;
  onArrangeByFilename: () => void;
  onAnalyzeDuplicates: () => void;
  onRemoveOtherPathDuplicates: () => void;
  onRemoveOtherContentDuplicates: () => void;
}

export function SelectionToolbar({
  isSelectionMode,
  setIsSelectionMode,
  selectedCount,
  analyzeDisabled,
  analyzeLoading,
  duplicateError,
  pathDuplicateCount,
  contentDuplicateCount,
  onArrangeByFilename,
  onAnalyzeDuplicates,
  onRemoveOtherPathDuplicates,
  onRemoveOtherContentDuplicates,
}: Props) {
  const selectedPhotoIds = useProjectStore((s) => s.selectedPhotoIds);
  const setPhotosBeatsOverride = useProjectStore((s) => s.setPhotosBeatsOverride);
  const removePhotos = useProjectStore((s) => s.removePhotos);
  const duplicatePhotos = useProjectStore((s) => s.duplicatePhotos);
  const clearSelection = useProjectStore((s) => s.clearSelection);

  const [showBeatsInput, setShowBeatsInput] = useState(false);
  const [beatsInput, setBeatsInput] = useState("");

  const selectedIds = [...selectedPhotoIds];

  const handleSetBeats = () => {
    if (!showBeatsInput) {
      setShowBeatsInput(true);
      return;
    }

    const value = parseFloat(beatsInput);
    if (Number.isFinite(value) && value > 0) {
      setPhotosBeatsOverride(selectedIds, value);
      setShowBeatsInput(false);
      setBeatsInput("");
    }
  };

  const handleExitSelectionMode = () => {
    setIsSelectionMode(false);
    clearSelection();
  };

  const btnBase: React.CSSProperties = {
    padding: "3px 10px",
    background: "#2a2a3e",
    border: "1px solid #444",
    color: "#c0c0d8",
    fontSize: 12,
    borderRadius: 4,
    cursor: "pointer",
  };

  const btnDanger: React.CSSProperties = { ...btnBase, color: "#f06060", borderColor: "#662222" };
  const btnAccent: React.CSSProperties = { ...btnBase, color: "#f59e0b", borderColor: "#a06010" };

  return (
    <div style={{
      display: "flex",
      flexWrap: "wrap",
      gap: 6,
      alignItems: "center",
      padding: "4px 12px",
      background: "#161622",
      minHeight: 32,
      borderBottom: "1px solid #2a2a3a",
    }}>
      <button style={btnBase} onClick={onArrangeByFilename}>
        Arrange by filename
      </button>
      <button style={btnBase} onClick={onAnalyzeDuplicates} disabled={analyzeDisabled}>
        {analyzeLoading ? "Analyzing..." : "Analyze duplicates"}
      </button>

      <div style={{ flex: 1 }} />

      {isSelectionMode && selectedCount > 0 && (
        <>
          <span style={{ fontSize: 11, color: "#888" }}>{selectedCount} selected</span>

          {showBeatsInput ? (
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <input
                type="number"
                step={0.25}
                min={0.25}
                value={beatsInput}
                onChange={(e) => setBeatsInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSetBeats();
                  if (e.key === "Escape") {
                    setShowBeatsInput(false);
                    setBeatsInput("");
                  }
                }}
                autoFocus
                placeholder="beats"
                style={{ width: 60, background: "#2a2a3e", color: "#e0e0f0", border: "1px solid #555", borderRadius: 4, padding: "2px 6px", fontSize: 12 }}
              />
              <button style={btnAccent} onClick={handleSetBeats}>OK</button>
            </div>
          ) : (
            <button style={btnBase} onClick={handleSetBeats}>Set beats</button>
          )}

          <button style={btnBase} onClick={() => setPhotosBeatsOverride(selectedIds, undefined)}>Reset beats</button>
          <button style={btnBase} onClick={() => duplicatePhotos(selectedIds)}>Duplicate</button>
          <button style={btnDanger} onClick={() => removePhotos(selectedIds)}>Remove</button>
        </>
      )}

      <button
        style={isSelectionMode ? btnAccent : btnBase}
        onClick={() => (isSelectionMode ? handleExitSelectionMode() : setIsSelectionMode(true))}
      >
        {isSelectionMode ? "Done" : "Select"}
      </button>

      {(duplicateError || pathDuplicateCount > 0 || contentDuplicateCount > 0) && (
        <div style={{ width: "100%", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", paddingTop: 4 }}>
          {duplicateError && <span style={{ color: "#f06060", fontSize: 11 }}>{duplicateError}</span>}
          {pathDuplicateCount > 0 && (
            <>
              <span style={{ fontSize: 11, color: "#aaa" }}>Path duplicates: {pathDuplicateCount}</span>
              <button style={btnDanger} onClick={onRemoveOtherPathDuplicates}>
                Remove path dups
              </button>
            </>
          )}
          {contentDuplicateCount > 0 && (
            <>
              <span style={{ fontSize: 11, color: "#aaa" }}>Content duplicates: {contentDuplicateCount}</span>
              <button style={btnDanger} onClick={onRemoveOtherContentDuplicates}>
                Remove content dups
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

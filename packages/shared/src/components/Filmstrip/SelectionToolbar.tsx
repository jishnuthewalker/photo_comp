import { useState } from "react";
import { useProjectStore } from "../../store/projectStore";
import { platform } from "../../lib/platform";
import type { Photo } from "../../store/types";

interface Props {
  photos: Photo[];
  isSelectionMode: boolean;
  setIsSelectionMode: (v: boolean) => void;
}

export function SelectionToolbar({ photos, isSelectionMode, setIsSelectionMode }: Props) {
  const selectedPhotoIds = useProjectStore((s) => s.selectedPhotoIds);
  const setPhotosBeatsOverride = useProjectStore((s) => s.setPhotosBeatsOverride);
  const removePhotos = useProjectStore((s) => s.removePhotos);
  const duplicatePhotos = useProjectStore((s) => s.duplicatePhotos);
  const setPhotos = useProjectStore((s) => s.setPhotos);
  const clearSelection = useProjectStore((s) => s.clearSelection);

  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [pathDupCount, setPathDupCount] = useState(0);
  const [contentDupCount, setContentDupCount] = useState(0);
  const [pathDupIds, setPathDupIds] = useState<string[]>([]);
  const [contentDupIds, setContentDupIds] = useState<string[]>([]);
  const [showBeatsInput, setShowBeatsInput] = useState(false);
  const [beatsInput, setBeatsInput] = useState("");

  const selectedIds = [...selectedPhotoIds];
  const selectedCount = selectedIds.length;

  const handleArrangeByFilename = () => {
    const sorted = [...photos].sort((a, b) => {
      const nameA = a.originalPath.split(/[\\/]/).pop() ?? a.originalPath;
      const nameB = b.originalPath.split(/[\\/]/).pop() ?? b.originalPath;
      return nameA.localeCompare(nameB);
    });
    setPhotos(sorted);
  };

  const handleAnalyzeDuplicates = async () => {
    setAnalyzeLoading(true);
    setAnalyzeError(null);
    setPathDupCount(0);
    setContentDupCount(0);
    setPathDupIds([]);
    setContentDupIds([]);
    try {
      const report = await platform().analyzeDuplicates(photos);
      setPathDupCount(report.pathDuplicateCount);
      setContentDupCount(report.contentDuplicateCount);

      // Collect ids to remove for each type (keep first in each group, remove the rest)
      const toRemovePath: string[] = [];
      const toRemoveContent: string[] = [];
      for (const group of report.groups) {
        const dupes = group.photos.slice(1).map((p) => p.id);
        if (group.type === "path") toRemovePath.push(...dupes);
        else toRemoveContent.push(...dupes);
      }
      setPathDupIds(toRemovePath);
      setContentDupIds(toRemoveContent);
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzeLoading(false);
    }
  };

  const handleSetBeats = () => {
    if (!showBeatsInput) { setShowBeatsInput(true); return; }
    const v = parseFloat(beatsInput);
    if (Number.isFinite(v) && v > 0) {
      setPhotosBeatsOverride(selectedIds, v);
      setShowBeatsInput(false);
      setBeatsInput("");
    }
  };

  const handleExitSelectionMode = () => {
    setIsSelectionMode(false);
    clearSelection();
  };

  // Inline style helpers
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
      {/* Left side: utility buttons */}
      <button style={btnBase} onClick={handleArrangeByFilename}>
        Arrange by filename
      </button>
      <button style={btnBase} onClick={handleAnalyzeDuplicates} disabled={analyzeLoading}>
        {analyzeLoading ? "Analyzing…" : "Analyze duplicates"}
      </button>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Bulk ops in selection mode */}
      {isSelectionMode && selectedCount > 0 && (
        <>
          <span style={{ fontSize: 11, color: "#888" }}>{selectedCount} selected</span>

          {/* Set beats */}
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
                  if (e.key === "Escape") { setShowBeatsInput(false); setBeatsInput(""); }
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

      {/* Select / Done toggle (rightmost) */}
      <button
        style={isSelectionMode ? btnAccent : btnBase}
        onClick={() => isSelectionMode ? handleExitSelectionMode() : setIsSelectionMode(true)}
      >
        {isSelectionMode ? "Done" : "Select"}
      </button>

      {/* Analyze results */}
      {(analyzeError || pathDupCount > 0 || contentDupCount > 0) && (
        <div style={{ width: "100%", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", paddingTop: 4 }}>
          {analyzeError && <span style={{ color: "#f06060", fontSize: 11 }}>{analyzeError}</span>}
          {pathDupCount > 0 && (
            <>
              <span style={{ fontSize: 11, color: "#aaa" }}>Path duplicates: {pathDupCount}</span>
              <button style={btnDanger} onClick={() => { removePhotos(pathDupIds); setPathDupCount(0); setPathDupIds([]); }}>
                Remove path dups
              </button>
            </>
          )}
          {contentDupCount > 0 && (
            <>
              <span style={{ fontSize: 11, color: "#aaa" }}>Content duplicates: {contentDupCount}</span>
              <button style={btnDanger} onClick={() => { removePhotos(contentDupIds); setContentDupCount(0); setContentDupIds([]); }}>
                Remove content dups
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

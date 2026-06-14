import { useState, useEffect } from "react";
import { FixedSizeGrid } from "react-window";
import { nanoid } from "nanoid";
import { PhotoGridCell } from "./PhotoGridCell";
import { useProjectStore } from "../../store/projectStore";
import { platform } from "../../lib/platform";
import type { PhotoMeta, PickedFile } from "../../lib/platform";

interface Props {
  onClose: () => void;
  initialFiles?: PickedFile[]; // pre-supplied files (e.g. from drag-drop)
}

const CELL_SIZE = 120;
const COLUMNS = 4;

export function PhotoGrid({ onClose, initialFiles }: Props) {
  const addPhotos = useProjectStore((s) => s.addPhotos);
  const [photos, setPhotos] = useState<PhotoMeta[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const doImport = async (files: PickedFile[]) => {
    setLoading(true);
    setImportError(null);
    try {
      const metas = await platform().importImages(files, (done, total) => {
        // progress available if needed
      });
      setPhotos((prev) => {
        const updated = [...prev, ...metas];
        setSelected((prevSel) => {
          const next = new Set(prevSel);
          metas.forEach((_, i) => next.add(prev.length + i));
          return next;
        });
        return updated;
      });
    } catch (err) {
      setImportError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    const files = await platform().pickImageFiles();
    if (files.length === 0) return;
    await doImport(files);
  };

  // Run initial import if files were pre-supplied (drag-drop)
  useEffect(() => {
    if (initialFiles && initialFiles.length > 0) {
      doImport(initialFiles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSelect = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const handleConfirm = () => {
    const chosen = photos
      .filter((_, i) => selected.has(i))
      .map((p) => ({
        id: nanoid(),
        originalPath: p.originalPath,
        thumbPath: p.thumbPath,
      }));
    addPhotos(chosen);
    onClose();
  };

  const rows = Math.ceil(photos.length / COLUMNS);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#1a1a2e", borderRadius: 8, padding: 24, width: 560, maxHeight: "80vh", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, color: "#fff" }}>Import Photos</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#888", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        {importError && (
          <div style={{ background: "#2a0e0e", border: "1px solid #a03030", borderRadius: 4, padding: 12, color: "#f06060", fontSize: 13 }}>
            {importError}
          </div>
        )}

        <button onClick={handleImport} disabled={loading} style={{ padding: "8px 16px", background: "#5b6eff", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>
          {loading ? "Loading…" : "Choose Photos / Folder"}
        </button>

        {photos.length > 0 && (
          <FixedSizeGrid
            columnCount={COLUMNS}
            columnWidth={CELL_SIZE}
            rowCount={rows}
            rowHeight={CELL_SIZE}
            width={COLUMNS * CELL_SIZE}
            height={400}
          >
            {({ columnIndex, rowIndex, style }) => {
              const i = rowIndex * COLUMNS + columnIndex;
              if (i >= photos.length) return null;
              return (
                <div key={i} style={style}>
                  <PhotoGridCell
                    thumbPath={photos[i].thumbPath}
                    selected={selected.has(i)}
                    onToggle={() => toggleSelect(i)}
                  />
                </div>
              );
            }}
          </FixedSizeGrid>
        )}

        <button
          onClick={handleConfirm}
          disabled={selected.size === 0}
          style={{ padding: "8px 16px", background: selected.size > 0 ? "#5b6eff" : "#444", color: "#fff", border: "none", borderRadius: 4, cursor: selected.size > 0 ? "pointer" : "default" }}
        >
          Add {selected.size} photos to filmstrip
        </button>
      </div>
    </div>
  );
}

import { useState } from "react";
import { FixedSizeGrid } from "react-window";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { nanoid } from "nanoid";
import { PhotoGridCell } from "./PhotoGridCell";
import { useProjectStore } from "../../store/projectStore";

interface ImportedPhoto {
  originalPath: string;
  thumbPath: string;
  width: number;
  height: number;
}

interface ImportResult {
  photos: ImportedPhoto[];
  heicPaths: string[];
}

interface Props {
  onClose: () => void;
}

const CELL_SIZE = 120;
const COLUMNS = 4;

export function PhotoGrid({ onClose }: Props) {
  const addPhotos = useProjectStore((s) => s.addPhotos);
  const [photos, setPhotos] = useState<ImportedPhoto[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [heicPending, setHeicPending] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const handleImport = async () => {
    const result = await open({ multiple: true, filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "heic", "heif"] }] });
    if (!result) return;
    const paths = Array.isArray(result) ? result : [result];
    setLoading(true);
    setImportError(null);
    try {
      const importResult = await invoke<ImportResult>("import_images", { paths, thumbSize: 240 });
      if (importResult.heicPaths.length > 0) {
        setHeicPending(importResult.heicPaths);
      }
      setPhotos(importResult.photos);
      setSelected(new Set(importResult.photos.map((_, i) => i)));
    } catch (err) {
      setImportError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleConvertHeic = async () => {
    setLoading(true);
    setImportError(null);
    try {
      const converted = await invoke<string[]>("convert_heic", { heicPaths: heicPending });
      setHeicPending([]);
      const importResult = await invoke<ImportResult>("import_images", { paths: converted, thumbSize: 240 });
      setPhotos((prev) => {
        const updated = [...prev, ...importResult.photos];
        setSelected((prevSel) => {
          const next = new Set(prevSel);
          importResult.photos.forEach((_, i) => next.add(prev.length + i));
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

        {heicPending.length > 0 && (
          <div style={{ background: "#2a1a0e", border: "1px solid #a06030", borderRadius: 4, padding: 12, color: "#f0a060" }}>
            {heicPending.length} photos are HEIC format. Convert to JPEG for compatibility?
            <button onClick={handleConvertHeic} style={{ marginLeft: 12, padding: "4px 12px", background: "#a06030", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>
              Convert
            </button>
          </div>
        )}

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

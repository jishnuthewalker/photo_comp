import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useProjectStore } from "../../store/projectStore";
import { CellContextMenu } from "./CellContextMenu";
import { FilmstripCell } from "./FilmstripCell";
import { SelectionToolbar } from "./SelectionToolbar";
import { arrangeSelectedPhotosByFilename } from "../../lib/photoImport";
import { invoke } from "@tauri-apps/api/core";

const MIN_H = 70;
const MAX_H = 320;
const DEFAULT_H = 130;

interface DuplicateFingerprint {
  normalizedPath: string;
  contentHash: string;
}

interface DuplicateReview {
  focusedPhotoId: string;
  pathDuplicateIds: string[];
  contentDuplicateIds: string[];
}

interface Props {
  activePhotoIndex: number;
  onCellClick: (index: number) => void;
}

export function Filmstrip({ activePhotoIndex, onCellClick }: Props) {
  const photos = useProjectStore((s) => s.project.photos);
  const bpm = useProjectStore((s) => s.project.bpm);
  const beatsPerPhoto = useProjectStore((s) => s.project.beatsPerPhoto);
  const removePhoto = useProjectStore((s) => s.removePhoto);
  const removePhotos = useProjectStore((s) => s.removePhotos);
  const clearPhotos = useProjectStore((s) => s.clearPhotos);
  const selectedPhotoIds = useProjectStore((s) => s.selectedPhotoIds);
  const setSelection = useProjectStore((s) => s.setSelection);
  const toggleSelection = useProjectStore((s) => s.toggleSelection);
  const selectRange = useProjectStore((s) => s.selectRange);
  const setSelectionAnchor = useProjectStore((s) => s.setSelectionAnchor);
  const duplicatePhotos = useProjectStore((s) => s.duplicatePhotos);

  const [height, setHeight] = useState(DEFAULT_H);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [duplicateReview, setDuplicateReview] = useState<DuplicateReview | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  useEffect(() => {
    setDuplicateReview(null);
    setDuplicateError(null);
  }, [photos, selectedPhotoIds]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = e.clientY - startY.current;
      setHeight(Math.max(MIN_H, Math.min(MAX_H, startH.current + delta)));
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== "d") return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      const ids = [...useProjectStore.getState().selectedPhotoIds];
      if (ids.length === 0) return;
      e.preventDefault();
      duplicatePhotos(ids);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [duplicatePhotos]);

  const cellImgH = Math.max(40, height - 36);
  const cellW = Math.round(cellImgH * (4 / 3));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleSelect = (index: number, event: React.MouseEvent) => {
    const photo = photos[index];
    if (!photo) return;

    if (event.shiftKey) {
      selectRange(index);
    } else if (event.ctrlKey || event.metaKey) {
      toggleSelection(photo.id);
      setSelectionAnchor(photo.id);
    } else {
      setSelection([photo.id]);
      setSelectionAnchor(photo.id);
    }

    onCellClick(index);
  };

  const handleContextMenu = (photoId: string, x: number, y: number) => {
    if (!selectedPhotoIds.has(photoId)) {
      setSelection([photoId]);
      setSelectionAnchor(photoId);
    }
    setContextMenu({ x, y });
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    if (!selectedPhotoIds.has(id)) {
      setSelection([id]);
      setSelectionAnchor(id);
    }
    setActiveDragId(id);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);
    if (!over || active.id === over.id) return;
    const fromIndex = photos.findIndex((p) => p.id === active.id);
    const toIndex = photos.findIndex((p) => p.id === over.id);
    if (fromIndex === -1 || toIndex === -1) return;

    const selectedIds = [...useProjectStore.getState().selectedPhotoIds];
    if (selectedIds.includes(String(active.id)) && selectedIds.length > 1) {
      useProjectStore.getState().reorderPhotosMulti(selectedIds, toIndex);
    } else {
      useProjectStore.getState().reorderPhotos(fromIndex, toIndex);
    }
  };

  const handleArrangeByFilename = () => {
    const selectedIds = new Set(selectedPhotoIds);
    if (selectedIds.size < 2) return;

    const arranged = arrangeSelectedPhotosByFilename(photos, selectedIds);
    useProjectStore.setState((state) => ({
      ...state,
      project: {
        ...state.project,
        photos: arranged,
      },
    }));
  };

  const analyzeSelectedDuplicates = async () => {
    const selectedPhotos = photos.filter((photo) => selectedPhotoIds.has(photo.id));
    if (selectedPhotos.length === 0) return;

    setDuplicateLoading(true);
    setDuplicateError(null);
    try {
      const fingerprints = await invoke<DuplicateFingerprint[]>("analyze_duplicates", {
        paths: selectedPhotos.map((photo) => photo.originalPath),
      });
      if (fingerprints.length !== selectedPhotos.length) {
        throw new Error("Duplicate analysis returned an unexpected number of results");
      }

      const fingerprintById = new Map(
        selectedPhotos.map((photo, index) => [photo.id, fingerprints[index]] as const)
      );
      const focus = selectedPhotos[0];
      const focusFingerprint = fingerprintById.get(focus.id);
      if (!focusFingerprint) {
        throw new Error("Duplicate analysis failed to fingerprint the selected photo");
      }

      const pathDuplicateIds = selectedPhotos
        .filter((photo) => photo.id !== focus.id && fingerprintById.get(photo.id)?.normalizedPath === focusFingerprint.normalizedPath)
        .map((photo) => photo.id);
      const contentDuplicateIds = selectedPhotos
        .filter((photo) => photo.id !== focus.id && fingerprintById.get(photo.id)?.contentHash === focusFingerprint.contentHash)
        .map((photo) => photo.id);

      setDuplicateReview({
        focusedPhotoId: focus.id,
        pathDuplicateIds,
        contentDuplicateIds,
      });
    } catch (error) {
      setDuplicateReview(null);
      setDuplicateError(error instanceof Error ? error.message : String(error));
    } finally {
      setDuplicateLoading(false);
    }
  };

  const removeSelectedDuplicates = (kind: "path" | "content") => {
    if (!duplicateReview) return;
    const ids = kind === "path" ? duplicateReview.pathDuplicateIds : duplicateReview.contentDuplicateIds;
    if (ids.length === 0) return;
    removePhotos(ids);
    setDuplicateReview(null);
  };

  return (
    <div className="filmstrip">
      {photos.length > 0 && (
        <div className="filmstrip-bar">
          <SelectionToolbar
            selectedCount={selectedPhotoIds.size}
            analyzeDisabled={selectedPhotoIds.size === 0 || duplicateLoading}
            analyzeLoading={duplicateLoading}
            duplicateError={duplicateError}
            pathDuplicateCount={duplicateReview?.pathDuplicateIds.length ?? 0}
            contentDuplicateCount={duplicateReview?.contentDuplicateIds.length ?? 0}
            onArrangeByFilename={handleArrangeByFilename}
            onAnalyzeDuplicates={analyzeSelectedDuplicates}
            onRemoveOtherPathDuplicates={() => removeSelectedDuplicates("path")}
            onRemoveOtherContentDuplicates={() => removeSelectedDuplicates("content")}
          />
          <button
            onClick={() => clearPhotos()}
            className="btn btn--danger"
          >
            Clear all
          </button>
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragCancel={() => setActiveDragId(null)}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={photos.map((p) => p.id)} strategy={horizontalListSortingStrategy}>
          <div
            className="filmstrip-scroll"
            style={{
              height: photos.length > 0 ? height : 44,
            }}
          >
            {photos.length === 0 && <span className="filmstrip-empty">Import photos to build your sequence</span>}
            {photos.map((photo, i) => (
              <FilmstripCell
                key={photo.id}
                photo={photo}
                index={i}
                isActive={i === activePhotoIndex}
                isSelected={selectedPhotoIds.has(photo.id)}
                dimmedGhost={activeDragId !== null && activeDragId !== photo.id && selectedPhotoIds.has(photo.id)}
                bpm={bpm}
                beatsPerPhoto={beatsPerPhoto}
                cellW={cellW}
                cellImgH={cellImgH}
                onRemove={() => removePhoto(photo.id)}
                onSelect={handleSelect}
                onContextMenu={handleContextMenu}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <div
        className="filmstrip-resize"
        onMouseDown={(e) => {
          dragging.current = true;
          startY.current = e.clientY;
          startH.current = height;
          e.preventDefault();
        }}
      />
      {contextMenu && (
        <CellContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onArrangeByFilename={handleArrangeByFilename}
          onAnalyzeDuplicates={analyzeSelectedDuplicates}
        />
      )}
    </div>
  );
}

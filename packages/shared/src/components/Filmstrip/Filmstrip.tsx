import { useRef, useState, useEffect } from "react";
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

const MIN_H = 70;
const MAX_H = 320;
const DEFAULT_H = 130;

interface Props {
  activePhotoIndex: number;
  onCellClick: (index: number) => void;
}

export function Filmstrip({ activePhotoIndex, onCellClick }: Props) {
  const photos = useProjectStore((s) => s.project.photos);
  const bpm = useProjectStore((s) => s.project.bpm);
  const beatsPerPhoto = useProjectStore((s) => s.project.beatsPerPhoto);
  const reorderPhotos = useProjectStore((s) => s.reorderPhotos);
  const removePhoto = useProjectStore((s) => s.removePhoto);
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
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  // Strip resize
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

  // Ctrl+D shortcut — duplicate selected
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

  // Disable drag in selection mode (touch-friendly: tap = toggle, drag = nothing)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: isSelectionMode ? 99999 : 5 } })
  );

  const handleSelect = (index: number, e: React.MouseEvent) => {
    const photo = photos[index];
    if (!photo) return;

    if (isSelectionMode) {
      // In checkbox mode: tap always toggles
      toggleSelection(photo.id);
    } else if (e.shiftKey) {
      selectRange(index);
    } else if (e.ctrlKey || e.metaKey) {
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
      reorderPhotos(fromIndex, toIndex);
    }
  };

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      {photos.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 0 0 0", background: "#161622" }}>
          <SelectionToolbar
            photos={photos}
            isSelectionMode={isSelectionMode}
            setIsSelectionMode={setIsSelectionMode}
          />
          <button
            onClick={() => clearPhotos()}
            style={{
              background: "none",
              border: "1px solid #555",
              color: "#aaa",
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 3,
              cursor: "pointer",
              marginRight: 12,
              flexShrink: 0,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#c03030"; (e.currentTarget as HTMLButtonElement).style.color = "#f06060"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#555"; (e.currentTarget as HTMLButtonElement).style.color = "#aaa"; }}
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
            style={{
              display: "flex",
              gap: 6,
              overflowX: "auto",
              padding: "8px 12px",
              background: "#161622",
              height,
              alignItems: "flex-start",
            }}
          >
            {photos.map((photo, i) => (
              <FilmstripCell
                key={photo.id}
                photo={photo}
                index={i}
                isActive={i === activePhotoIndex}
                isSelected={selectedPhotoIds.has(photo.id)}
                dimmedGhost={activeDragId !== null && activeDragId !== photo.id && selectedPhotoIds.has(photo.id)}
                showCheckbox={isSelectionMode}
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
      {/* Drag handle */}
      <div
        onMouseDown={(e) => {
          dragging.current = true;
          startY.current = e.clientY;
          startH.current = height;
          e.preventDefault();
        }}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 6,
          cursor: "ns-resize",
          background: "transparent",
          zIndex: 10,
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(91,110,255,0.4)")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      />
      {contextMenu && (
        <CellContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onArrangeByFilename={() => {
            const sorted = [...photos].sort((a, b) => {
              const nameA = a.originalPath.split(/[\\/]/).pop() ?? a.originalPath;
              const nameB = b.originalPath.split(/[\\/]/).pop() ?? b.originalPath;
              return nameA.localeCompare(nameB);
            });
            useProjectStore.getState().setPhotos(sorted);
          }}
          onAnalyzeDuplicates={() => {
            setContextMenu(null);
          }}
        />
      )}
    </div>
  );
}

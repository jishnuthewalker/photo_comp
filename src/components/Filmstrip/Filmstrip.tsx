import { useRef, useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useProjectStore } from "../../store/projectStore";
import { FilmstripCell } from "./FilmstripCell";

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

  const [height, setHeight] = useState(DEFAULT_H);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

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

  // Cell image height fills the strip minus padding/label; width keeps 4:3
  const cellImgH = Math.max(40, height - 36);
  const cellW = Math.round(cellImgH * (4 / 3));

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = photos.findIndex((p) => p.id === active.id);
    const toIndex = photos.findIndex((p) => p.id === over.id);
    if (fromIndex !== -1 && toIndex !== -1) reorderPhotos(fromIndex, toIndex);
  };

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      {photos.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 12px 0", background: "#161622" }}>
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
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#c03030"; (e.currentTarget as HTMLButtonElement).style.color = "#f06060"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#555"; (e.currentTarget as HTMLButtonElement).style.color = "#aaa"; }}
          >
            Clear all
          </button>
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
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
              <div key={photo.id} onClick={() => onCellClick(i)}>
                <FilmstripCell
                  photo={photo}
                  index={i}
                  isActive={i === activePhotoIndex}
                  bpm={bpm}
                  beatsPerPhoto={beatsPerPhoto}
                  cellW={cellW}
                  cellImgH={cellImgH}
                  onRemove={() => removePhoto(photo.id)}
                />
              </div>
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
    </div>
  );
}

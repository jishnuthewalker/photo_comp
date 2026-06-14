import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { assetUrl } from "../../utils/tauriAsset";
import type { Photo } from "../../store/types";

interface Props {
  photo: Photo;
  index: number;
  isActive: boolean;
  isSelected: boolean;
  dimmedGhost: boolean;
  bpm: number;
  beatsPerPhoto: number;
  cellW: number;
  cellImgH: number;
  onRemove: () => void;
  onSelect: (index: number, event: React.MouseEvent) => void;
  onContextMenu: (photoId: string, x: number, y: number) => void;
}

export function FilmstripCell({ photo, index, isActive, isSelected, dimmedGhost, bpm, beatsPerPhoto, cellW, cellImgH, onRemove, onSelect, onContextMenu }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id });
  const beats = photo.beatsOverride ?? beatsPerPhoto;
  const [hovered, setHovered] = useState(false);

  const borderColor = isSelected ? "#f0a500" : isActive ? "#5b6eff" : "transparent";

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : dimmedGhost ? 0.5 : 1,
        flexShrink: 0,
        width: cellW,
        position: "relative",
        cursor: "grab",
        border: `2px solid ${borderColor}`,
        borderRadius: 4,
        overflow: "visible",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => onSelect(index, e)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(photo.id, e.clientX, e.clientY); }}
      {...attributes}
      {...listeners}
    >
      <img
        src={assetUrl(photo.thumbPath)}
        alt=""
        style={{ width: cellW, height: cellImgH, objectFit: "cover", display: "block", borderRadius: 2 }}
      />
      <div style={{
        position: "absolute",
        bottom: 2,
        right: 2,
        background: "rgba(0,0,0,0.7)",
        color: "#fff",
        fontSize: 9,
        padding: "1px 4px",
        borderRadius: 2,
      }}>
        {beats}b
      </div>
      <div style={{ textAlign: "center", fontSize: 9, color: "#888", marginTop: 2 }}>
        {index + 1}
      </div>
      {hovered && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{
            position: "absolute",
            top: 2,
            right: 2,
            width: 18,
            height: 18,
            background: "rgba(200,50,50,0.9)",
            color: "#fff",
            border: "none",
            borderRadius: "50%",
            fontSize: 12,
            lineHeight: "18px",
            textAlign: "center",
            cursor: "pointer",
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

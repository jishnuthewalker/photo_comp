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
  /** True when a multi-drag is active and this cell is a non-active selected member.
   *  Neutralizes sortable transforms so the cell stays in place. */
  dimmedGhost: boolean;
  /** True when checkbox mode is active (touch/persistent select mode) */
  showCheckbox: boolean;
  bpm: number;
  beatsPerPhoto: number;
  cellW: number;
  cellImgH: number;
  onRemove: () => void;
  onSelect: (index: number, e: React.MouseEvent) => void;
  onContextMenu: (photoId: string, clientX: number, clientY: number) => void;
}

export function FilmstripCell({
  photo,
  index,
  isActive,
  isSelected,
  dimmedGhost,
  showCheckbox,
  beatsPerPhoto,
  cellW,
  cellImgH,
  onRemove,
  onSelect,
  onContextMenu,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id });
  const beats = photo.beatsOverride ?? beatsPerPhoto;
  const [hovered, setHovered] = useState(false);

  // dimmedGhost: neutralize dnd-kit transforms so ghost members don't slide
  const appliedTransform = dimmedGhost ? "none" : CSS.Transform.toString(transform);
  const appliedTransition = dimmedGhost ? "none" : transition;
  const opacity = dimmedGhost ? 0.3 : isDragging ? 0.4 : 1;

  // Border: selected=amber, active=blue, both=amber+inner-blue-shadow
  const AMBER = "#f59e0b";
  const BLUE = "#5b6eff";
  const border = isSelected ? `2px solid ${AMBER}` : isActive ? `2px solid ${BLUE}` : "2px solid transparent";
  const boxShadow = isSelected && isActive ? `inset 0 0 0 2px ${BLUE}` : undefined;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: appliedTransform,
        transition: appliedTransition,
        opacity,
        flexShrink: 0,
        width: cellW,
        position: "relative",
        cursor: "grab",
        border,
        boxShadow,
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

      {/* Amber selection overlay tint */}
      {isSelected && (
        <div style={{
          position: "absolute",
          inset: 0,
          background: "rgba(245,158,11,0.12)",
          borderRadius: 2,
          pointerEvents: "none",
        }} />
      )}

      {/* Beats badge — bottom-right */}
      <div style={{
        position: "absolute",
        bottom: 2,
        right: 2,
        background: "rgba(0,0,0,0.7)",
        color: photo.beatsOverride !== undefined ? AMBER : "#fff",
        fontSize: 9,
        padding: "1px 4px",
        borderRadius: 2,
      }}>
        {beats}b
      </div>

      {/* Index label */}
      <div style={{ textAlign: "center", fontSize: 9, color: "#888", marginTop: 2 }}>
        {index + 1}
      </div>

      {/* Checkbox circle — top-left: filled amber when selected, grey outline when showCheckbox && !isSelected */}
      {(isSelected || showCheckbox) && (
        <div style={{
          position: "absolute",
          top: 2,
          left: 2,
          width: 16,
          height: 16,
          background: isSelected ? AMBER : "transparent",
          border: isSelected ? "none" : "2px solid rgba(150,150,150,0.7)",
          color: isSelected ? "#000" : "transparent",
          borderRadius: "50%",
          fontSize: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}>
          {isSelected ? "✓" : ""}
        </div>
      )}

      {/* Remove × button — top-right, visible on hover (but not in showCheckbox mode) */}
      {hovered && !showCheckbox && (
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

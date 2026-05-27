import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { assetUrl } from "../../utils/tauriAsset";
import type { Photo } from "../../store/types";

interface Props {
  photo: Photo;
  index: number;
  isActive: boolean;
  bpm: number;
  beatsPerPhoto: number;
}

export function FilmstripCell({ photo, index, isActive, bpm, beatsPerPhoto }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id });
  const beats = photo.beatsOverride ?? beatsPerPhoto;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        flexShrink: 0,
        width: 80,
        position: "relative",
        cursor: "grab",
        border: isActive ? "2px solid #5b6eff" : "2px solid transparent",
        borderRadius: 4,
        overflow: "visible",
      }}
      {...attributes}
      {...listeners}
    >
      <img
        src={assetUrl(photo.thumbPath)}
        alt=""
        style={{ width: 80, height: 60, objectFit: "cover", display: "block", borderRadius: 2 }}
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
    </div>
  );
}

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

interface Props {
  activePhotoIndex: number;
  onCellClick: (index: number) => void;
}

export function Filmstrip({ activePhotoIndex, onCellClick }: Props) {
  const photos = useProjectStore((s) => s.project.photos);
  const bpm = useProjectStore((s) => s.project.bpm);
  const beatsPerPhoto = useProjectStore((s) => s.project.beatsPerPhoto);
  const reorderPhotos = useProjectStore((s) => s.reorderPhotos);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = photos.findIndex((p) => p.id === active.id);
    const toIndex = photos.findIndex((p) => p.id === over.id);
    if (fromIndex !== -1 && toIndex !== -1) reorderPhotos(fromIndex, toIndex);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={photos.map((p) => p.id)} strategy={horizontalListSortingStrategy}>
        <div
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            padding: "8px 12px",
            background: "#161622",
            minHeight: 90,
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
              />
            </div>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

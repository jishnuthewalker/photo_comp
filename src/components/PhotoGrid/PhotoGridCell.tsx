import { assetUrl } from "../../utils/tauriAsset";

interface Props {
  thumbPath: string;
  selected: boolean;
  onToggle: () => void;
}

export function PhotoGridCell({ thumbPath, selected, onToggle }: Props) {
  return (
    <div
      onClick={onToggle}
      style={{
        position: "relative",
        cursor: "pointer",
        border: selected ? "2px solid #5b6eff" : "2px solid transparent",
        borderRadius: 4,
        overflow: "hidden",
        aspectRatio: "1",
        background: "#222",
      }}
    >
      <img
        src={assetUrl(thumbPath)}
        alt=""
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
      {selected && (
        <div
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            background: "#5b6eff",
            color: "#fff",
            borderRadius: "50%",
            width: 18,
            height: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
          }}
        >
          ✓
        </div>
      )}
    </div>
  );
}

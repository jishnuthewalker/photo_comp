import { useRef, useEffect } from "react";
import { assetUrl } from "../../utils/tauriAsset";
import { useProjectStore } from "../../store/projectStore";
import type { Photo } from "../../store/types";

const RATIO_MAP: Record<string, [number, number]> = {
  "16:9": [16, 9],
  "9:16": [9, 16],
  "1:1": [1, 1],
  "4:3": [4, 3],
};

interface Props {
  photos: Photo[];
  activeIndex: number;
}

export function PreviewCanvas({ photos, activeIndex }: Props) {
  const cropRatio = useProjectStore((s) => s.project.cropRatio);
  const scaleMode = useProjectStore((s) => s.project.scaleMode);
  const globalTransition = useProjectStore((s) => s.project.globalTransition);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  const [rw, rh] = RATIO_MAP[cropRatio] ?? [16, 9];
  // Keep long edge at 1280 for resolution
  const canvasW = rw >= rh ? 1280 : Math.round(1280 * rw / rh);
  const canvasH = rh > rw  ? 1280 : Math.round(1280 * rh / rw);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (photos.length === 0) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    const photo = photos[activeIndex];
    if (!photo) return;

    const drawImg = (img: HTMLImageElement) => {
      if (globalTransition !== "stack") {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      let scale: number;
      if (scaleMode === "cover") {
        scale = Math.max(canvas.width / img.width, canvas.height / img.height);
      } else {
        scale = Math.min(canvas.width / img.width, canvas.height / img.height);
      }
      const sw = img.width * scale;
      const sh = img.height * scale;
      const sx = (canvas.width - sw) / 2;
      const sy = (canvas.height - sh) / 2;
      ctx.drawImage(img, sx, sy, sw, sh);
    };

    const cached = imgCacheRef.current.get(photo.thumbPath);
    if (cached) {
      drawImg(cached);
    } else {
      const img = new Image();
      img.src = assetUrl(photo.thumbPath);
      img.onload = () => {
        imgCacheRef.current.set(photo.thumbPath, img);
        drawImg(img);
      };
    }
  }, [activeIndex, photos, cropRatio, scaleMode, globalTransition, canvasW, canvasH]);

  return (
    <canvas
      ref={canvasRef}
      width={canvasW}
      height={canvasH}
      style={{ maxHeight: "40vh", maxWidth: "100%", objectFit: "contain", background: "#000" }}
    />
  );
}

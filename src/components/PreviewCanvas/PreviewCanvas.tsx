import { useRef, useEffect } from "react";
import { assetUrl } from "../../utils/tauriAsset";
import type { Photo } from "../../store/types";

interface Props {
  photos: Photo[];
  activeIndex: number;
}

export function PreviewCanvas({ photos, activeIndex }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || photos.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const photo = photos[activeIndex];
    if (!photo) return;

    const drawImg = (img: HTMLImageElement) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Cover: scale to fill canvas preserving aspect ratio
      const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
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
  }, [activeIndex, photos]);

  return (
    <canvas
      ref={canvasRef}
      width={1280}
      height={720}
      style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
    />
  );
}

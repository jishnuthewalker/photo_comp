export interface FrameDrawOptions {
  canvasW: number;
  canvasH: number;
  scaleMode: "cover" | "contain";
  transition: "cut" | "crossfade" | "stack";
  alpha?: number;
}

export function drawPhotoFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  img: HTMLImageElement | ImageBitmap,
  opts: FrameDrawOptions
): void {
  const { canvasW, canvasH, scaleMode, transition, alpha = 1 } = opts;

  if (transition !== "stack") {
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  const scale =
    scaleMode === "cover"
      ? Math.max(canvasW / img.width, canvasH / img.height)
      : Math.min(canvasW / img.width, canvasH / img.height);

  const sw = img.width * scale;
  const sh = img.height * scale;
  const sx = (canvasW - sw) / 2;
  const sy = (canvasH - sh) / 2;

  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img as CanvasImageSource, sx, sy, sw, sh);
  ctx.globalAlpha = prevAlpha;
}

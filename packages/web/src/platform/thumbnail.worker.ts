// Message types
interface ThumbnailRequest {
  id: string;
  blob: Blob;
  maxSize: number; // max pixel dimension for thumbnail
}

interface ThumbnailResponse {
  id: string;
  thumbBlob: Blob;
  origWidth: number;
  origHeight: number;
  error?: string;
}

self.onmessage = async (e: MessageEvent<ThumbnailRequest>) => {
  const { id, blob, maxSize } = e.data;
  try {
    // Create full-size bitmap first (gets correct EXIF orientation via imageOrientation)
    const fullBitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
    const origWidth = fullBitmap.width;
    const origHeight = fullBitmap.height;
    fullBitmap.close();

    // Compute thumbnail size keeping aspect ratio
    const scale = Math.min(1, maxSize / Math.max(origWidth, origHeight));
    const thumbW = Math.round(origWidth * scale);
    const thumbH = Math.round(origHeight * scale);

    // Re-decode at requested size for thumbnail (browser may optimize)
    const thumbBitmap = await createImageBitmap(blob, {
      imageOrientation: "from-image",
      resizeWidth: thumbW,
      resizeHeight: thumbH,
      resizeQuality: "medium",
    });

    const canvas = new OffscreenCanvas(thumbW, thumbH);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(thumbBitmap, 0, 0);
    thumbBitmap.close();

    const thumbBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });

    const response: ThumbnailResponse = { id, thumbBlob, origWidth, origHeight };
    (self as unknown as Worker).postMessage(response, []);
  } catch (err) {
    const response: ThumbnailResponse = {
      id,
      thumbBlob: new Blob(),
      origWidth: 0,
      origHeight: 0,
      error: String(err),
    };
    (self as unknown as Worker).postMessage(response, []);
  }
};

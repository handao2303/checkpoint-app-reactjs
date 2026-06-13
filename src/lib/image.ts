// Client-side image pipeline for uploads: convert iPhone HEIC/HEIF to JPEG and
// downscale large photos. This keeps every upload a modest JPEG, sidestepping
// the backend's image-type whitelist and per-request size limit.

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;
const CHECKPOINT_MAX_EDGE = 2560;
const CHECKPOINT_QUALITY = 0.9;
const CHECKPOINT_MAX_BYTES = 3 * 1024 * 1024;
const THUMBNAIL_MAX_EDGE = 640;
const THUMBNAIL_QUALITY = 0.8;

export interface PreparedCheckpointImage {
  original: File;
  thumbnail: File;
}

function isHeic(file: File): boolean {
  return /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

function toJpegName(name: string): string {
  return name.replace(/\.\w+$/, "") + ".jpg";
}

/** Convert (if HEIC) + downscale a picked image. Falls back to the original
 *  file if any step is unsupported, so a check-in never silently loses a photo. */
export async function prepareImage(file: File): Promise<File> {
  const working = await convertHeic(file, JPEG_QUALITY);

  try {
    return await resizeJpeg(working, MAX_EDGE, JPEG_QUALITY, "", true);
  } catch {
    return working;
  }
}

/** Prepare a high-quality check-in image plus its lightweight list thumbnail. */
export async function prepareCheckpointImage(file: File): Promise<PreparedCheckpointImage> {
  const working = await convertHeic(file, CHECKPOINT_QUALITY);
  const original = await resizeUnderLimit(
    working,
    CHECKPOINT_MAX_EDGE,
    CHECKPOINT_QUALITY,
    CHECKPOINT_MAX_BYTES,
  );
  const thumbnail = await resizeJpeg(original, THUMBNAIL_MAX_EDGE, THUMBNAIL_QUALITY, "-thumb");
  return { original, thumbnail };
}

async function convertHeic(file: File, quality: number): Promise<File> {
  if (!isHeic(file)) return file;
  try {
    const { default: heic2any } = await import("heic2any");
    const out = (await heic2any({ blob: file, toType: "image/jpeg", quality })) as Blob;
    return new File([out], toJpegName(file.name), { type: "image/jpeg" });
  } catch {
    return file;
  }
}

async function resizeUnderLimit(
  file: File,
  maxEdge: number,
  initialQuality: number,
  maxBytes: number,
): Promise<File> {
  let quality = initialQuality;
  let edge = maxEdge;
  let result = await resizeJpeg(file, edge, quality);
  while (result.size > maxBytes && quality > 0.65) {
    quality -= 0.05;
    result = await resizeJpeg(file, edge, quality);
  }
  while (result.size > maxBytes && edge > 1280) {
    edge = Math.max(1280, Math.round(edge * 0.85));
    result = await resizeJpeg(file, edge, quality);
  }
  return result;
}

async function resizeJpeg(
  file: File,
  maxEdge: number,
  quality: number,
  suffix = "",
  preserveIfSmall = false,
): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  if (preserveIfSmall && scale === 1 && /^image\/(jpeg|png|webp)$/.test(file.type)) {
    bitmap.close();
    return file;
  }

  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) return file;
  const baseName = toJpegName(file.name).replace(/\.jpg$/, "");
  return new File([blob], `${baseName}${suffix}.jpg`, { type: "image/jpeg" });
}

// Client-side image pipeline for uploads: convert iPhone HEIC/HEIF to JPEG and
// downscale large photos. This keeps every upload a modest JPEG, sidestepping
// the backend's image-type whitelist and per-request size limit.

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

function isHeic(file: File): boolean {
  return /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

function toJpegName(name: string): string {
  return name.replace(/\.\w+$/, "") + ".jpg";
}

/** Convert (if HEIC) + downscale a picked image. Falls back to the original
 *  file if any step is unsupported, so a check-in never silently loses a photo. */
export async function prepareImage(file: File): Promise<File> {
  let working = file;

  // HEIC/HEIF (iPhone default) → JPEG. heic2any is browser-only and heavy, so
  // load it on demand only when we actually hit a HEIC file.
  if (isHeic(file)) {
    try {
      const { default: heic2any } = await import("heic2any");
      const out = (await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: JPEG_QUALITY,
      })) as Blob;
      working = new File([out], toJpegName(file.name), { type: "image/jpeg" });
    } catch {
      // Conversion failed — let downscale/backend deal with the original.
    }
  }

  try {
    return await downscale(working);
  } catch {
    return working;
  }
}

async function downscale(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));

  // Already small and an accepted type → no re-encode needed.
  if (scale === 1 && /^image\/(jpeg|png|webp)$/.test(file.type)) {
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
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) return file;
  return new File([blob], toJpegName(file.name), { type: "image/jpeg" });
}

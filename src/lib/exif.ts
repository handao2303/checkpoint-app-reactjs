import { parse } from "exifr";

export interface GPS {
  lat: number;
  lng: number;
}

export interface PhotoMetadata {
  gps: GPS | null;
  takenAt?: string;
}

function normalizeExifDate(value: unknown): string | undefined {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value !== "string" || !value.trim()) return undefined;

  const trimmed = value.trim();
  const normalized = trimmed.replace(
    /^(\d{4}):(\d{2}):(\d{2})(.*)$/,
    "$1-$2-$3$4",
  );
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) return undefined;
  return date.toISOString();
}

/** Extract GPS coordinates and capture time from a photo's EXIF metadata.
 *  GPS returns null when the photo has no GPS tags, the coordinates are at/near
 *  (0,0) "Null Island", or parsing fails.
 *
 *  Uses exifr.parse() with GPS and EXIF options instead of the exifr.gps()
 *  shorthand — the shorthand uses a stripped-down parser that misses some
 *  Android GPS IFD encodings. The near-zero check handles Android devices that
 *  write an empty GPS IFD (all zeros) when location services are disabled. */
export async function extractPhotoMetadata(file: File): Promise<PhotoMetadata> {
  try {
    const result = await parse(file, {
      gps: true,
      tiff: true,
      exif: true,
      iptc: false,
      jfif: false,
      ihdr: false,
    });
    if (!result) return { gps: null };
    const lat = result.latitude as number | undefined;
    const lng = result.longitude as number | undefined;
    const takenAt =
      normalizeExifDate(result.DateTimeOriginal) ??
      normalizeExifDate(result.CreateDate) ??
      normalizeExifDate(result.ModifyDate);
    if (lat == null || lng == null) return { gps: null, takenAt };
    if (Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001) return { gps: null, takenAt };
    return { gps: { lat, lng }, takenAt };
  } catch {
    return { gps: null };
  }
}

export async function extractGPS(file: File): Promise<GPS | null> {
  return (await extractPhotoMetadata(file)).gps;
}

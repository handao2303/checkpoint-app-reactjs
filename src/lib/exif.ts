import { parse } from "exifr";

export interface GPS {
  lat: number;
  lng: number;
}

/** Extract GPS coordinates from a photo's EXIF metadata. Returns null when the
 *  photo has no GPS tags, the coordinates are at/near (0,0) "Null Island", or
 *  parsing fails.
 *
 *  Uses exifr.parse() with GPS-only options instead of the exifr.gps()
 *  shorthand — the shorthand uses a stripped-down parser that misses some
 *  Android GPS IFD encodings. The near-zero check handles Android devices that
 *  write an empty GPS IFD (all zeros) when location services are disabled. */
export async function extractGPS(file: File): Promise<GPS | null> {
  try {
    const result = await parse(file, {
      gps: true,
      tiff: false,
      exif: false,
      iptc: false,
      jfif: false,
      ihdr: false,
    });
    if (!result) return null;
    const lat = result.latitude as number | undefined;
    const lng = result.longitude as number | undefined;
    if (lat == null || lng == null) return null;
    if (Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

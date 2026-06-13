import * as exifr from "exifr";

export interface GPS {
  lat: number;
  lng: number;
}

/** Extract GPS coordinates from a photo's EXIF metadata. Returns null when the
 *  photo has no GPS tags, coordinates are (0, 0), or parsing fails. */
export async function extractGPS(file: File): Promise<GPS | null> {
  try {
    const gps = await exifr.gps(file);
    if (!gps || gps.latitude == null || gps.longitude == null) return null;
    if (gps.latitude === 0 && gps.longitude === 0) return null;
    return { lat: gps.latitude, lng: gps.longitude };
  } catch {
    return null;
  }
}

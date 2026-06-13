import { useEffect, useState } from "react";
import { reverseGeocode, type GeoResult } from "../lib/photon";

// Module-level cache — survives component remounts, avoids duplicate Photon
// calls for the same coordinates. Key is rounded to 4dp (~11m precision) so
// micro-GPS drift doesn't cause unnecessary refetches.
const cache = new Map<string, GeoResult | null>();

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

/** Reverse-geocode a coordinate, returning cached results instantly on
 *  subsequent calls with the same (or very nearby) coordinates. */
export function useGeocode(lat: number | null, lng: number | null): GeoResult | null {
  const [result, setResult] = useState<GeoResult | null>(() => {
    if (lat == null || lng == null) return null;
    const hit = cache.get(cacheKey(lat, lng));
    return hit !== undefined ? hit : null;
  });

  useEffect(() => {
    if (lat == null || lng == null) return;
    const key = cacheKey(lat, lng);
    if (cache.has(key)) {
      setResult(cache.get(key)!);
      return;
    }
    let cancelled = false;
    reverseGeocode(lat, lng).then((res) => {
      cache.set(key, res);
      if (!cancelled) setResult(res);
    });
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  return result;
}

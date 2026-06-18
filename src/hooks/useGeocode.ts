import { useEffect, useState } from "react";
import { reverseGeocode, type GeoResult } from "../lib/bigdatacloud";

const CACHE_KEY_PREFIX = "geocode_cache_";

// In-memory cache for fast access within the same session
const memoryCache = new Map<string, GeoResult | null>();

function getCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

function getCachedResult(key: string): GeoResult | null {
  // Check memory cache first
  if (memoryCache.has(key)) {
    return memoryCache.get(key)!;
  }

  if (typeof window === "undefined") return null;
  try {
    const item = localStorage.getItem(CACHE_KEY_PREFIX + key);
    if (item) {
      const parsed = JSON.parse(item);
      memoryCache.set(key, parsed); // Hydrate memory cache
      return parsed;
    }
  } catch {
    // Ignore storage/parsing errors
  }
  return null;
}

function setCachedResult(key: string, result: GeoResult | null): void {
  memoryCache.set(key, result);
  
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY_PREFIX + key, JSON.stringify(result));
  } catch {
    // Ignore storage errors (e.g. quota exceeded)
  }
}

/** Reverse-geocode a coordinate, returning cached results instantly on
 *  subsequent calls with the same (or very nearby) coordinates. 
 *  Results persist across page reloads via localStorage. */
export function useGeocode(lat: number | null, lng: number | null): GeoResult | null {
  const [result, setResult] = useState<GeoResult | null>(() => {
    if (lat == null || lng == null) return null;
    return getCachedResult(getCacheKey(lat, lng));
  });

  useEffect(() => {
    if (lat == null || lng == null) return;
    const key = getCacheKey(lat, lng);
    const cached = getCachedResult(key);

    if (cached) {
      setResult(cached);
      return;
    }

    let cancelled = false;
    reverseGeocode(lat, lng).then((res) => {
      setCachedResult(key, res);
      if (!cancelled) setResult(res);
    });

    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  return result;
}

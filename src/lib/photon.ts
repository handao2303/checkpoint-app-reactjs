// Reverse-geocode coordinates using the Photon public API (photon.komoot.io).
// Called from the client — Photon returns Access-Control-Allow-Origin: * so
// browser requests are fine.

const BASE = "https://photon.komoot.io";

export interface GeoResult {
  address: string;
  province: string;
}

/** Resolve lat/lng to an address + province. Returns null on any failure. */
export async function reverseGeocode(lat: number, lng: number): Promise<GeoResult | null> {
  try {
    const url = `${BASE}/reverse?lat=${lat.toFixed(6)}&lon=${lng.toFixed(6)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const json = await res.json();
    return parsePhoton(json);
  } catch {
    return null;
  }
}

interface PhotonProps {
  name?: string;
  street?: string;
  district?: string;
  locality?: string;
  city?: string;
  county?: string;
  state?: string;
}

function parsePhoton(payload: { features?: Array<{ properties: PhotonProps }> }): GeoResult | null {
  const feature = payload.features?.[0];
  if (!feature) return null;
  const p = feature.properties;

  const province = firstNonEmpty(p.state, p.county, p.city);
  let address = joinUnique(p.district, p.locality, p.city, p.county, p.state);
  if (!address) address = joinUnique(p.name, p.street);

  if (!address && !province) return null;
  return { address, province };
}

function joinUnique(...vals: (string | undefined)[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of vals) {
    const t = v?.trim() ?? "";
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out.join(", ");
}

function firstNonEmpty(...vals: (string | undefined)[]): string {
  for (const v of vals) {
    const t = v?.trim() ?? "";
    if (t) return t;
  }
  return "";
}

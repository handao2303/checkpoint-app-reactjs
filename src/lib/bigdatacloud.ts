export interface GeoResult {
  address: string;
  province: string;     // ISO Province Code (e.g. "VN-SG")
  provinceName: string; // Display name (e.g. "Thành phố Hồ Chí Minh")
}

const BASE = "https://api.bigdatacloud.net/data/reverse-geocode-client";

/** Resolve lat/lng to an address + province code using BigDataCloud. Returns null on any failure. */
export async function reverseGeocode(lat: number, lng: number): Promise<GeoResult | null> {
  try {
    // Detect browser language (e.g., 'vi', 'en', 'fr')
    const locale = typeof navigator !== "undefined" ? navigator.language.split("-")[0] : "en";
    const url = `${BASE}?latitude=${lat.toFixed(6)}&longitude=${lng.toFixed(6)}&localityLanguage=${locale}`;
    
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const json = await res.json();
    
    return parseBigDataCloud(json);
  } catch {
    return null;
  }
}

interface BigDataCloudResponse {
  principalSubdivision?: string;     // Province name (e.g. "Thành phố Hồ Chí Minh")
  principalSubdivisionCode?: string; // ISO Province Code (e.g. "VN-SG")
  city?: string;
  locality?: string;                  // Ward/Commune/Neighborhood (e.g. "Hạnh Thông")
  localityInfo?: {
    informative?: Array<{ name: string; order: number }>;
  };
}

function parseBigDataCloud(p: BigDataCloudResponse): GeoResult | null {
  const provinceCode = p.principalSubdivisionCode?.trim() ?? "";
  const provinceName = p.principalSubdivision?.trim() ?? "";

  /** 
   * Generic District extraction:
   * Look for the most specific "informative" name that isn't the province or locality itself.
   */
  let district = "";
  if (p.localityInfo?.informative) {
    // Sort by order descending to get the most specific entities first
    const sortedInformative = [...p.localityInfo.informative].sort((a, b) => b.order - a.order);
    
    for (const item of sortedInformative) {
      const name = item.name.trim();
      // Skip if it matches known levels to find the "middle" one
      if (name && name !== provinceName && name !== p.locality) {
        district = name;
        break; 
      }
    }
  }

  // Fallback to city if district is still empty and city is distinct from province
  if (!district && p.city && p.city !== provinceName) {
    district = p.city;
  }

  const address = joinUnique(p.locality, district, p.principalSubdivision);

  if (!address && !provinceCode) return null;

  return { 
    address, 
    province: provinceCode, 
    provinceName: provinceName 
  };
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

// Map configuration. OpenFreeMap is fully free and needs no API token.
export const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

// Default view (Hồ Chí Minh City) until geolocation kicks in.
export const DEFAULT_VIEW = { longitude: 106.7, latitude: 10.776, zoom: 12 };

export const CATEGORIES = [
  { key: "cafe", label: "Cà phê", icon: "☕" },
  { key: "food", label: "Ăn uống", icon: "🍜" },
  { key: "view", label: "Ngắm cảnh", icon: "🌄" },
  { key: "nature", label: "Thiên nhiên", icon: "🌲" },
  { key: "other", label: "Khác", icon: "📍" },
] as const;

export function categoryIcon(category: string): string {
  return CATEGORIES.find((c) => c.key === category)?.icon ?? "📍";
}

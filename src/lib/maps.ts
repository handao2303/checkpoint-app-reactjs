// Map configuration. OpenFreeMap is fully free and needs no API token.
export const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

// Default view (Hồ Chí Minh City) until geolocation kicks in.
export const DEFAULT_VIEW = { longitude: 106.7, latitude: 10.776, zoom: 12 };

import type { IconName } from "../components/ui/Icon";

// `icon` is a key into the self-hosted SVG registry (for on-screen <Icon>);
// `emoji` is kept only for canvas rendering in shareCard.ts, where a React
// component can't be used.
export const CATEGORIES = [
  { key: "cafe", label: "Cà phê", icon: "coffee", emoji: "☕" },
  { key: "food", label: "Ăn uống", icon: "food", emoji: "🍜" },
  { key: "view", label: "Ngắm cảnh", icon: "mountain", emoji: "🌄" },
  { key: "nature", label: "Thiên nhiên", icon: "tree", emoji: "🌲" },
  { key: "other", label: "Khác", icon: "pin", emoji: "📍" },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  icon: IconName;
  emoji: string;
}>;

/** The SVG icon name for a category (for <Icon name=...>). */
export function categoryIcon(category: string): IconName {
  return CATEGORIES.find((c) => c.key === category)?.icon ?? "pin";
}

/** The emoji for a category — only for canvas drawing (shareCard.ts). */
export function categoryEmoji(category: string): string {
  return CATEGORIES.find((c) => c.key === category)?.emoji ?? "📍";
}

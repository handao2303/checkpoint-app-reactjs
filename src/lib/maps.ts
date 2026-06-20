// Map configuration. OpenFreeMap is fully free and needs no API token.
export const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

// Default view (Hồ Chí Minh City) until geolocation kicks in.
export const DEFAULT_VIEW = { longitude: 106.7, latitude: 10.776, zoom: 12 };

import type { IconName } from "../components/ui/Icon";

// `icon` is a key into the self-hosted SVG registry (for on-screen <Icon>).
// `labelKey` is the i18n key — resolve it with `t()` at render time so the
// label re-renders on language change.
export const CATEGORIES = [
  { key: "cafe", labelKey: "ca_phe", icon: "coffee", emoji: "☕" },
  { key: "food", labelKey: "an_uong", icon: "food", emoji: "🍜" },
  { key: "view", labelKey: "ngam_canh", icon: "mountain", emoji: "🌄" },
  { key: "nature", labelKey: "thien_nhien", icon: "tree", emoji: "🌲" },
  { key: "other", labelKey: "khac", icon: "pin", emoji: "📍" },
] as const satisfies ReadonlyArray<{
  key: string;
  labelKey: string;
  icon: IconName;
  emoji: string;
}>;

/** The SVG icon name for a category (for <Icon name=...>). */
export function categoryIcon(category: string): IconName {
  return CATEGORIES.find((c) => c.key === category)?.icon ?? "pin";
}

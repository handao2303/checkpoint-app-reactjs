import type { TFunction } from "i18next";
import type { Badge } from "./api";

type BadgeText = Pick<Badge, "key" | "name" | "description">;

export function badgeName(t: TFunction, badge: BadgeText): string {
  return t(`badge_name_${badge.key}`, badge.name);
}

export function badgeDescription(t: TFunction, badge: BadgeText): string {
  return t(`badge_desc_${badge.key}`, badge.description);
}

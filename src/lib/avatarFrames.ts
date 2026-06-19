import { t } from "./i18n";
// Avatar frame catalog — mirrors checkpoint_avatar_frames_svg/manifest.json.
// Frames are decorative rings baked into the avatar image at upload time
// (see avatarComposite.ts). Level frames unlock by the user's level; badge
// frames unlock when the matching achievement badge is awarded.

import { checkpointImageUrl } from "./checkpointImages";

export type FrameTier = "Bronze" | "Silver" | "Gold" | "Emerald" | "Master";

export interface AvatarFrame {
  /** Stable id, e.g. "level-50" or "night-owl". */
  id: string;
  /** Public URL of the SVG. */
  file: string;
  /** Vietnamese label shown in the picker. */
  label: string;
  kind: "level" | "badge";
  /** Level frames only: the level that unlocks this frame. */
  level?: number;
  tier?: FrameTier;
  /** Badge frames only: the backend badge key that unlocks this frame. */
  badgeKey?: string;
}

const FRAMES_BASE = "frames";

/** Public URL of the level-range medallion icon for a level (number drawn in UI). */
export function levelTierIconUrl(level: number): string {
  return checkpointImageUrl(`levels/level-range-${TIER_FOR_LEVEL(level).toLowerCase()}.svg`);
}

const TIER_FOR_LEVEL = (level: number): FrameTier => {
  if (level >= 41) return "Master";
  if (level >= 31) return "Emerald";
  if (level >= 21) return "Gold";
  if (level >= 11) return "Silver";
  return "Bronze";
};

/** Level frames 1..50, file names are zero-padded (avatar-frame-level-07.svg). */
export const LEVEL_FRAMES: AvatarFrame[] = Array.from({ length: 50 }, (_, i) => {
  const level = i + 1;
  const padded = String(level).padStart(2, "0");
  return {
    id: `level-${level}`,
    file: checkpointImageUrl(`${FRAMES_BASE}/avatar-frame-level-${padded}.svg`),
    label: t('cap_level', { level: level }),
    kind: "level" as const,
    level,
    tier: TIER_FOR_LEVEL(level),
  };
});

/** Badge-themed frames, unlocked alongside their achievement badge. */
export const BADGE_FRAMES: AvatarFrame[] = [
  { id: "first-step", file: checkpointImageUrl(`${FRAMES_BASE}/avatar-frame-first-step.svg`), label: t('buoc_chan_dau_tien'), kind: "badge", badgeKey: "first_checkin" },
  { id: "explorer", file: checkpointImageUrl(`${FRAMES_BASE}/avatar-frame-explorer.svg`), label: t('nha_tham_hiem'), kind: "badge", badgeKey: "explorer_10" },
  { id: "country", file: checkpointImageUrl(`${FRAMES_BASE}/avatar-frame-country.svg`), label: t('vong_quanh_dat_nuoc'), kind: "badge", badgeKey: "provinces_5" },
  { id: "night-owl", file: checkpointImageUrl(`${FRAMES_BASE}/avatar-frame-night-owl.svg`), label: t('cu_dem'), kind: "badge", badgeKey: "night_owl" },
  { id: "traveler", file: checkpointImageUrl(`${FRAMES_BASE}/avatar-frame-traveler.svg`), label: t('ke_lu_hanh'), kind: "badge", badgeKey: "journey_starter" },
];

export const ALL_FRAMES: AvatarFrame[] = [...LEVEL_FRAMES, ...BADGE_FRAMES];

export function frameById(id: string | null | undefined): AvatarFrame | undefined {
  if (!id) return undefined;
  return ALL_FRAMES.find((f) => f.id === id);
}

/** Whether the user has unlocked a given frame. */
export function isFrameUnlocked(
  frame: AvatarFrame,
  level: number,
  awardedBadgeKeys: ReadonlySet<string>,
): boolean {
  if (frame.kind === "level") return level >= (frame.level ?? 1);
  return frame.badgeKey ? awardedBadgeKeys.has(frame.badgeKey) : false;
}

/**
 * Frames to show in the picker: every unlocked level frame, the next level
 * frame as a locked teaser, and all badge frames (locked ones greyed out).
 */
export function buildPickerFrames(
  level: number,
  awardedBadgeKeys: ReadonlySet<string>,
): { frame: AvatarFrame; unlocked: boolean }[] {
  const levelCap = Math.min(50, level + 1); // unlocked levels + one teaser
  const levels = LEVEL_FRAMES.filter((f) => (f.level ?? 1) <= levelCap).map((f) => ({
    frame: f,
    unlocked: level >= (f.level ?? 1),
  }));
  const badges = BADGE_FRAMES.map((f) => ({
    frame: f,
    unlocked: isFrameUnlocked(f, level, awardedBadgeKeys),
  }));
  return [...levels, ...badges];
}

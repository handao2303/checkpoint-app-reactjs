// Avatar frame catalog — mirrors checkpoint_avatar_frames_svg_220/manifest.json.
// Frames are decorative rings baked into the avatar image at upload time
// (see avatarComposite.ts). Level frames unlock by the user's level; badge
// frames unlock when the matching achievement badge is awarded.

import { checkpointImageUrl } from "./checkpointImages";

export type FrameTier = "Bronze" | "Silver" | "Gold" | "Emerald" | "Master";

export interface AvatarFrame {
  /** Stable id, e.g. "level-50" or "night-owl". */
  id: string;
  /** Public URL of the frame image used for baking. */
  file: string;
  /** Optional thumbnail URL. Use this when the baked asset differs from preview art. */
  previewFile?: string;
  /** i18n key for the label shown in the picker. Resolve with `t()` at render
   *  time so the label re-renders on language change. */
  labelKey: string;
  /** Interpolation params for `labelKey` (e.g. the level number). */
  labelParams?: Record<string, unknown>;
  kind: "level" | "badge";
  /** Level frames only: the level that unlocks this frame. */
  level?: number;
  tier?: FrameTier;
  /** Badge frames only: the backend badge key that unlocks this frame. */
  badgeKey?: string;
}

const FRAMES_BASE = "frames";

function avatarFrameSvgUrl(filename: string): string {
  return checkpointImageUrl(`${FRAMES_BASE}/${filename}`);
}

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
    labelKey: "cap_level",
    labelParams: { level },
    kind: "level" as const,
    level,
    tier: TIER_FOR_LEVEL(level),
  };
});

/** Badge-themed frames, unlocked alongside their achievement badge. */
export const BADGE_FRAMES: AvatarFrame[] = [
  { id: "first-steps-flag", file: avatarFrameSvgUrl("01-first-steps-flag.svg"), previewFile: avatarFrameSvgUrl("01-first-steps-flag.svg"), labelKey: "buoc_chan_dau_tien", kind: "badge", badgeKey: "first_checkin" },
  { id: "explorer-compass", file: avatarFrameSvgUrl("02-explorer-compass.svg"), previewFile: avatarFrameSvgUrl("02-explorer-compass.svg"), labelKey: "nha_tham_hiem", kind: "badge", badgeKey: "explorer_10" },
  { id: "around-the-country-map", file: avatarFrameSvgUrl("03-around-the-country-map.svg"), previewFile: avatarFrameSvgUrl("03-around-the-country-map.svg"), labelKey: "vong_quanh_dat_nuoc", kind: "badge", badgeKey: "provinces_5" },
  { id: "night-owl", file: avatarFrameSvgUrl("04-night-owl.svg"), previewFile: avatarFrameSvgUrl("04-night-owl.svg"), labelKey: "cu_dem", kind: "badge", badgeKey: "night_owl" },
  { id: "traveler-passport", file: avatarFrameSvgUrl("05-traveler-passport.svg"), previewFile: avatarFrameSvgUrl("05-traveler-passport.svg"), labelKey: "ke_lu_hanh", kind: "badge", badgeKey: "journey_starter" },
  { id: "coffee-hunter", file: avatarFrameSvgUrl("06-coffee-hunter.svg"), previewFile: avatarFrameSvgUrl("06-coffee-hunter.svg"), labelKey: "coffee_hunter", kind: "badge", badgeKey: "coffee_hunter" },
  { id: "social-scout", file: avatarFrameSvgUrl("07-social-scout.svg"), previewFile: avatarFrameSvgUrl("07-social-scout.svg"), labelKey: "social_scout", kind: "badge", badgeKey: "social_scout" },
  { id: "city-collector", file: avatarFrameSvgUrl("08-city-collector.svg"), previewFile: avatarFrameSvgUrl("08-city-collector.svg"), labelKey: "city_collector", kind: "badge", badgeKey: "city_collector" },
  { id: "weekend-wanderer", file: avatarFrameSvgUrl("09-weekend-wanderer.svg"), previewFile: avatarFrameSvgUrl("09-weekend-wanderer.svg"), labelKey: "weekend_wanderer", kind: "badge", badgeKey: "weekend_wanderer" },
  { id: "photo-storyteller", file: avatarFrameSvgUrl("10-photo-storyteller.svg"), previewFile: avatarFrameSvgUrl("10-photo-storyteller.svg"), labelKey: "photo_storyteller", kind: "badge", badgeKey: "photo_storyteller" },
  { id: "hidden-gem-finder", file: avatarFrameSvgUrl("11-hidden-gem-finder.svg"), previewFile: avatarFrameSvgUrl("11-hidden-gem-finder.svg"), labelKey: "hidden_gem_finder", kind: "badge", badgeKey: "hidden_gem_finder" },
  { id: "passport-pro", file: avatarFrameSvgUrl("12-passport-pro.svg"), previewFile: avatarFrameSvgUrl("12-passport-pro.svg"), labelKey: "passport_pro", kind: "badge", badgeKey: "passport_pro" },
];

export const LEADERBOARD_FRAMES: AvatarFrame[] = [
  { id: "leaderboard", file: checkpointImageUrl(`${FRAMES_BASE}/avatar_frame_rank_1.png`), labelKey: "cap_bang_xep_hang", kind: "badge", badgeKey: "leaderboard" },
  { id: "leaderboard", file: checkpointImageUrl(`${FRAMES_BASE}/avatar_frame_rank_2.png`), labelKey: "cap_bang_xep_hang", kind: "badge", badgeKey: "leaderboard" },
  { id: "leaderboard", file: checkpointImageUrl(`${FRAMES_BASE}/avatar_frame_rank_3.png`), labelKey: "cap_bang_xep_hang", kind: "badge", badgeKey: "leaderboard" },
];

export const ALL_FRAMES: AvatarFrame[] = [...LEVEL_FRAMES, ...BADGE_FRAMES];

const LEGACY_FRAME_IDS: Record<string, string> = {
  "first-step": "first-steps-flag",
  explorer: "explorer-compass",
  country: "around-the-country-map",
  traveler: "traveler-passport",
};

export function frameById(id: string | null | undefined): AvatarFrame | undefined {
  if (!id) return undefined;
  const currentId = LEGACY_FRAME_IDS[id] ?? id;
  return ALL_FRAMES.find((f) => f.id === currentId);
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
  const badges = BADGE_FRAMES.map((f) => ({
    frame: f,
    unlocked: isFrameUnlocked(f, level, awardedBadgeKeys),
  }));
  return [...badges];
}

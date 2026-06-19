import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "./ui/Icon";
import { UserAvatar } from "./ui/UserAvatar";
import { Sheet } from "./ui/Sheet";
import { Button } from "./ui/Button";
import { useAuth } from "../auth/AuthContext";
import { getBadges, updateProfile, uploadAvatar } from "../lib/api";
import { prepareImage } from "../lib/image";
import { AvatarCropSheet } from "./AvatarCropSheet";
import { buildPickerFrames } from "../lib/avatarFrames";
import { trackError, trackEvent } from "../lib/observability";

// The selected frame is baked into the image, so the backend doesn't track it.
// Remember the last choice locally to pre-select it next time.
const frameStorageKey = (userId: string) => `cp_avatar_frame:${userId}`;

/** Edit display name + bio, and change avatar. Updates the cached auth user on
 *  success so the profile reflects changes immediately. */
export function EditProfileSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { user, applyUser } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: badges = [] } = useQuery({ queryKey: ["badges"], queryFn: getBadges });

  if (!user) return null;

  const awardedKeys = new Set(badges.filter((b) => b.awarded).map((b) => b.key));
  const frameOptions = buildPickerFrames(user.level, awardedKeys);
  const rememberedFrameId =
    (typeof localStorage !== "undefined" && localStorage.getItem(frameStorageKey(user.id))) || null;

  const pickAvatar = () => fileRef.current?.click();

  const onAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;
    trackEvent("avatar_pick");
    setError(null);
    setUploading(true);
    try {
      // Convert HEIC + downscale; then open crop sheet.
      const prepared = await prepareImage(file);
      setCropImageSrc(URL.createObjectURL(prepared));
      trackEvent("avatar_prepare_success");
    } catch {
      // Fallback: use the original file directly.
      setCropImageSrc(URL.createObjectURL(file));
      trackEvent("avatar_prepare_failed");
    } finally {
      setUploading(false);
    }
  };

  const onCropDone = async (blob: Blob, frameId: string | null) => {
    setCropImageSrc(null);
    setUploading(true);
    setError(null);
    try {
      trackEvent("avatar_crop_done", { has_frame: !!frameId });
      // Baked avatars are PNG (transparent corners around the circle/medallion).
      const file = new File([blob], "avatar.png", { type: "image/png" });
      applyUser(await uploadAvatar(file));
      trackEvent("avatar_upload_success", { has_frame: !!frameId });
      try {
        if (frameId) localStorage.setItem(frameStorageKey(user.id), frameId);
        else localStorage.removeItem(frameStorageKey(user.id));
        trackEvent("avatar_frame_select", { has_frame: !!frameId });
      } catch {
        // localStorage unavailable (private mode) — harmless
      }
    } catch (err) {
      trackError(err, { feature: "profile", action: "avatar_upload" });
      trackEvent("avatar_upload_failed");
      setError(err instanceof Error ? err.message : t('tai_anh_that_bai'));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const name = displayName.trim();
      const b = bio.trim();
      applyUser(
        await updateProfile({
          display_name: name,
          bio: b,
        }),
      );
      trackEvent("profile_update_success", { has_display_name: !!name, has_bio: !!b });
      onClose();
    } catch (err) {
      trackError(err, { feature: "profile", action: "profile_update" });
      trackEvent("profile_update_failed");
      setError(err instanceof Error ? err.message : t('luu_that_bai'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Sheet title={t('sua_ho_so')} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={pickAvatar}
            disabled={uploading}
            className="relative h-28 w-28 disabled:opacity-60"
            aria-label={t('doi_anh_dai_dien')}
          >
            <UserAvatar
              src={user.avatar_url}
              name={user.display_name}
              username={user.username}
              className="h-28 w-28"
              loading="eager"
              fallbackClassName="h-24 w-24 border-4 border-border bg-surface-muted text-muted-foreground"
            />
            <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
              <Icon name="camera" size={16} />
            </span>
          </button>
          <span className="text-xs text-muted-foreground">
            {uploading ? t('dang_tai_anh') : t('cham_de_doi_anh_khung')}
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={onAvatarChange}
          />
        </div>

        {/* Display name */}
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-foreground">{t('ten_hien_thi')}</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={user.username}
            maxLength={50}
            className="rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

        {/* Bio */}
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-foreground">{t('gioi_thieu')}</span>
          <textarea
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder={t('doi_dong_ve_ban')}
            maxLength={160}
            className="resize-none rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

        {error && <p className="text-sm text-accent-600">{error}</p>}

        <Button className="w-full" disabled={saving || uploading} onClick={save}>
          {saving ? t('dang_luu') : t('luu')}
        </Button>
      </div>
    </Sheet>
      {cropImageSrc && (
        <AvatarCropSheet
          imageSrc={cropImageSrc}
          frameOptions={frameOptions}
          initialFrameId={rememberedFrameId}
          onClose={() => {
            URL.revokeObjectURL(cropImageSrc);
            setCropImageSrc(null);
          }}
          onDone={onCropDone}
        />
      )}
    </>
  );
}

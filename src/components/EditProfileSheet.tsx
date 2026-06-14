import { useRef, useState } from "react";
import { Icon } from "./ui/Icon";
import { Sheet } from "./ui/Sheet";
import { Button } from "./ui/Button";
import { useAuth } from "../auth/AuthContext";
import { updateProfile, uploadAvatar } from "../lib/api";
import { prepareImage } from "../lib/image";
import { AvatarCropSheet } from "./AvatarCropSheet";

/** Edit display name + bio, and change avatar. Updates the cached auth user on
 *  success so the profile reflects changes immediately. */
export function EditProfileSheet({ onClose }: { onClose: () => void }) {
  const { user, applyUser } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  const pickAvatar = () => fileRef.current?.click();

  const onAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      // Convert HEIC + downscale; then open crop sheet.
      const prepared = await prepareImage(file);
      setCropImageSrc(URL.createObjectURL(prepared));
    } catch {
      // Fallback: use the original file directly.
      setCropImageSrc(URL.createObjectURL(file));
    } finally {
      setUploading(false);
    }
  };

  const onCropDone = async (blob: Blob) => {
    setCropImageSrc(null);
    setUploading(true);
    setError(null);
    try {
      const file = new File([blob], "avatar.jpg", { type: "image/jpeg" });
      applyUser(await uploadAvatar(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tải ảnh thất bại.");
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
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lưu thất bại.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Sheet title="Sửa hồ sơ" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={pickAvatar}
            disabled={uploading}
            className="relative h-24 w-24 rounded-full disabled:opacity-60"
            aria-label="Đổi ảnh đại diện"
          >
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt=""
                className="h-24 w-24 rounded-full border-4 border-border object-cover"
              />
            ) : (
              <span className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-border bg-surface-muted" />
            )}
            <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
              <Icon name="camera" size={16} />
            </span>
          </button>
          <span className="text-xs text-muted-foreground">
            {uploading ? "Đang tải ảnh..." : "Chạm để đổi ảnh đại diện"}
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
          <span className="text-sm font-semibold text-foreground">Tên hiển thị</span>
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
          <span className="text-sm font-semibold text-foreground">Giới thiệu</span>
          <textarea
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Đôi dòng về bạn..."
            maxLength={160}
            className="resize-none rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

        {error && <p className="text-sm text-accent-600">{error}</p>}

        <Button className="w-full" disabled={saving || uploading} onClick={save}>
          {saving ? "Đang lưu..." : "Lưu"}
        </Button>
      </div>
    </Sheet>
      {cropImageSrc && (
        <AvatarCropSheet
          imageSrc={cropImageSrc}
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

import { useTranslation } from "react-i18next";
import type { User } from "../lib/api";
import { Icon } from "./ui/Icon";
import { UserAvatar } from "./ui/UserAvatar";

interface ProfileHeaderProps {
  user: User;
  province?: string;
  onOpenProfile: (userId: string) => void;
}

function avatarRingClass(level: number) {
  if (level >= 16) return "border-4 border-yellow-400";
  if (level >= 6) return "border-4 border-orange-300";
  return "border-4 border-white/30";
}

function formatMemberSince(dateStr: string): string {
  const d = new Date(dateStr);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${month}/${d.getFullYear()}`;
}

export function ProfileHeader({ user, province, onOpenProfile }: ProfileHeaderProps) {
  const { t } = useTranslation();

  return (
    <>
      {/* Avatar + info */}
      <div className="flex items-start gap-1">
        <button
          type="button"
          onClick={() => onOpenProfile(user.id)}
          className="relative shrink-0 text-left transition hover:opacity-80 cursor-pointer outline-none"
          aria-label={t('xem_ho_so_cong_khai')}
        >
          <UserAvatar
            src={user.avatar_url}
            name={user.display_name}
            username={user.username}
            className="h-25 w-25"
            loading="eager"
            fallbackClassName={`h-24 w-24 bg-primary-50 text-primary ${avatarRingClass(user.level)}`}
          />
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-primary-100 bg-primary-50 px-2.5 py-0.5 text-xs font-extrabold text-primary shadow-sm">
            {t('cap_level', { level: user.level })}
          </span>
        </button>
        <div className="min-w-0 flex-1 justify-between mt-3 gap-4">
          <h2 className="font-display text-xl font-bold leading-tight">
            {user.display_name || user.username}
          </h2>
          <p className="text-sm text-muted-foreground">@{user.username}</p>
          {province && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Icon name="pin" size={12} />
              {province}
            </span>
          )}
          {user.bio && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{user.bio}</p>
          )}
        </div>
      </div>

      {/* Tags */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-muted-foreground">
        {user.checkin_streak > 0 && (
          <span className="flex items-center gap-1">
            <Icon name="fire" size={12} className="text-primary" />
            {t('streak_ngay_lien_tiep', { streak: user.checkin_streak })}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Icon name="calendar" size={12} />
          {t('thanh_vien_tu', { date: formatMemberSince(user.created_at) })}
        </span>
      </div>
    </>
  );
}

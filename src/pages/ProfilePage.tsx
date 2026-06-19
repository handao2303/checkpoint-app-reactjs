import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { BadgeMedal } from "../components/BadgeMedal";
import { EditProfileSheet } from "../components/EditProfileSheet";
import { SettingsSheet } from "../components/SettingsSheet";
import { JourneysSection } from "../components/JourneysSection";
import { MediaPreview } from "../components/MediaPreview";
import { MyCheckpointsSheet } from "../components/MyCheckpointsSheet";
import { PassportSection } from "../components/PassportSection";
import { ShareButton } from "../components/share/ShareButton";
import { Button } from "../components/ui/Button";
import { Card, ImagePlaceholder } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";
import { Skeleton } from "../components/ui/Skeleton";
import { Toast } from "../components/ui/Toast";
import { UserAvatar } from "../components/ui/UserAvatar";
import { UpgradeBanner } from "../components/UpgradeBanner";
import { useUserProfile } from "../context/UserProfileProvider";
import {
  API_URL,
  getBadges,
  getLeaderboard,
  getMyCheckpoints,
  getPassport,
  type Checkpoint,
  type LeaderboardEntry,
} from "../lib/api";
import { categoryIcon } from "../lib/maps";
import { trackEvent } from "../lib/observability";
import { renderProfileCard } from "../lib/shareCard";


function MomentCaption({ cp }: { cp?: Checkpoint }) {
  if (!cp) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] bg-gradient-to-t from-black/80 to-transparent p-4 pb-8 text-center text-white">
      <p className="font-display text-lg font-bold">{cp.name}</p>
      {cp.note && <p className="text-sm">{cp.note}</p>}
      {cp.address && (
        <div className="mt-0.5 flex items-start justify-center gap-1 text-xs opacity-80">
          <Icon name="map-pin" size={12} className="mt-0.5 shrink-0" />
          <span>{cp.address}</span>
        </div>
      )}
    </div>
  );
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

function PodiumMini({ entry, rank }: { entry: LeaderboardEntry; rank: 1 | 2 | 3 }) {
  const { showProfile } = useUserProfile();
  const ringClass = { 1: "ring-yellow-400", 2: "ring-slate-400", 3: "ring-amber-600" }[rank];
  const name = entry.display_name || entry.username;
  return (
    <button
      type="button"
      onClick={() => showProfile(entry.username)}
      className="flex flex-1 flex-col items-center gap-1 px-1 transition hover:opacity-80 text-center cursor-pointer outline-none"
    >
      <div className="relative">
        <UserAvatar
          src={entry.avatar_url}
          name={name}
          username={entry.username}
          className="h-11 w-11"
          fallbackClassName={`h-10 w-10 ring-2 ${ringClass}`}
        />
        <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-surface px-1 text-[10px] font-bold text-muted-foreground shadow-sm">
          #{rank}
        </span>
      </div>
      <p className="mt-2 w-full truncate text-xs font-semibold text-foreground">{name}</p>
      <p className="text-[10px] text-muted-foreground">{entry.total_xp.toLocaleString()} XP</p>
    </button>
  );
}

export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const { user, signOut } = useAuth();
  const { showProfile } = useUserProfile();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [settingsSheetOpen, setSettingsSheetOpen] = useState(false);
  const [checkpointsSheetOpen, setCheckpointsSheetOpen] = useState(false);

  const { data: myCheckpoints = [], isLoading: momentsLoading } = useQuery({
    queryKey: ["checkpoints", "me"],
    queryFn: () => getMyCheckpoints(4),
  });
  const { data: passport } = useQuery({
    queryKey: ["passport"],
    queryFn: getPassport,
  });
  const { data: badges = [], isLoading: badgesLoading } = useQuery({
    queryKey: ["badges"],
    queryFn: getBadges,
  });
  const { data: leaderboard } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: getLeaderboard,
  });

  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [driveToast, setDriveToast] = useState<string | null>(null);

  useEffect(() => {
    trackEvent("profile_open");
    const drive = searchParams.get("drive");
    const photos = searchParams.get("photos");
    if (drive === "connected") {
      trackEvent("integration_connect_return_success", { provider: "drive" });
      setDriveToast("Đã kết nối Google Drive ✓");
      void queryClient.invalidateQueries({ queryKey: ["drive-status"] });
      setSearchParams({}, { replace: true });
    } else if (drive === "error") {
      trackEvent("integration_connect_return_failed", { provider: "drive" });
      setDriveToast("Kết nối Google Drive thất bại");
      setSearchParams({}, { replace: true });
    } else if (photos === "connected") {
      trackEvent("integration_connect_return_success", { provider: "photos" });
      setDriveToast("Đã kết nối Google Photos ✓");
      void queryClient.invalidateQueries({ queryKey: ["photos-status"] });
      setSearchParams({}, { replace: true });
    } else if (photos === "error") {
      trackEvent("integration_connect_return_failed", { provider: "photos" });
      setDriveToast("Kết nối Google Photos thất bại");
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return null;

  const unlockedBadges = badges.filter((b) => b.awarded);
  const top3 = leaderboard?.entries.slice(0, 3) ?? [];
  const firstProvince = passport?.stamps?.[0]?.province;

  return (
    <div className="flex flex-col gap-5 pb-4">
      {user.is_anonymous && <UpgradeBanner />}

      {/* Hero card */}
      <div className="relative rounded-2xl border border-border bg-surface p-5 text-foreground shadow-card">
        <button
          onClick={() => {
            trackEvent("profile_edit_open");
            setEditing(true);
          }}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-muted text-clay-700 hover:bg-primary-50 hover:text-primary cursor-pointer"
          aria-label={t("profile.editProfile")}
        >
          <Icon name="pencil" size={16} />
        </button>

        <button
          onClick={() => {
            trackEvent("profile_settings_open");
            setSettingsSheetOpen(true);
          }}
          className="absolute right-3 top-14 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-muted text-clay-700 hover:bg-primary-50 hover:text-primary cursor-pointer"
          aria-label="Cài đặt"
        >
          <Icon name="settings" size={16} />
        </button>

        {/* Avatar + info */}
        <div className="flex items-start gap-1">
          <button
            type="button"
            onClick={() => showProfile(user.username)}
            className="relative shrink-0 text-left transition hover:opacity-80 cursor-pointer outline-none"
            aria-label="Xem hồ sơ công khai"
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
              Cấp {user.level}
            </span>
          </button>
          <div className="min-w-0 flex-1 justify-between mt-3 gap-4">
            <h2 className="font-display text-xl font-bold leading-tight">
              {user.display_name || user.username}
            </h2>
            <p className="text-sm text-muted-foreground">@{user.username}</p>
            {firstProvince && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Icon name="pin" size={12} />
                {firstProvince}
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
              {user.checkin_streak} ngày liên tiếp
            </span>
          )}
          <span className="flex items-center gap-1">
            <Icon name="calendar" size={12} />
            Thành viên từ {formatMemberSince(user.created_at)}
          </span>
        </div>

        {/* Stats */}
        <div className="mt-4 grid grid-cols-4 gap-2">
          {[
            { label: t("profile.badgesLabel", "Huy hiệu"), value: unlockedBadges.length.toString() },
            { label: t("profile.checkpointCountLabel", "Cờ"), value: user.checkpoint_count.toString() },
            { label: t("profile.journeyCountLabel", "Hành trình"), value: user.journey_count.toString() },
            { label: t("profile.levelLabel", "Cấp"), value: user.level.toString() },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-surface-muted py-2 text-center">
              <p className="text-[10px] font-semibold text-muted-foreground">{s.label}</p>
              <p className="font-display text-base font-extrabold text-clay-800">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Level card */}
      <Card>
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Icon
                  name="star"
                  size={20}
                  className="text-gold"
                />
                <p className="font-semibold text-foreground">{t("profile.currentLevel", "Cấp độ hiện tại")}</p>
              </div>
              <p className="text-sm text-muted-foreground">{user.total_xp.toLocaleString()} XP</p>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-primary-100">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500"
                style={{
                  width: `${Math.round(Math.min(1, Math.max(0, user.level_progress)) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-1 text-xs italic text-muted-foreground">
              {user.xp_to_next > 0
                ? t("profile.xpToNext", { count: user.xp_to_next.toLocaleString(), level: user.level + 1 })
                : t("profile.maxLevel")}
            </p>
          </div>
        </div>
      </Card>

      {/* Badges preview — horizontal scroll */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-lg font-bold">
            <Icon name="badge" size={20} className="text-gold" /> Huy hiệu
          </h3>
          <button
            type="button"
            onClick={() => {
              trackEvent("badges_open", { source: "profile_preview" });
              navigate("/badges");
            }}
            className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Xem tất cả <Icon name="chevron-right" size={14} />
          </button>
        </div>
        {badgesLoading ? (
          <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-none">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex w-14 shrink-0 flex-col items-center gap-0.5">
                <span
                  className="h-10 w-10 shrink-0"
                  style={{ clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }}
                >
                  <Skeleton className="h-full w-full rounded-none" />
                </span>
                <Skeleton className="mt-1 h-3 w-10" />
              </div>
            ))}
          </div>
        ) : unlockedBadges.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa có huy hiệu nào. Hãy check-in để mở khóa!
          </p>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-none">
            {unlockedBadges.map((b) => (
              <div
                key={b.key}
                className="flex w-14 shrink-0 flex-col items-center gap-0.5 text-center"
              >
                <BadgeMedal badge={b} awarded size="sm" showLevel={b.level} />
                <p className="w-full truncate text-[10px] font-medium leading-tight">{b.name}</p>
              </div>
            ))}
          </div>
        )}
      </Card>



      {/* Journeys */}
      <JourneysSection />

      {/* Mini leaderboard */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-lg font-bold">
            <Icon name="trophy" size={20} className="text-gold" /> Bảng xếp hạng
          </h3>
          <button
            type="button"
            onClick={() => {
              trackEvent("leaderboard_open", { source: "profile_preview" });
              navigate("/leaderboard");
            }}
            className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Xem tất cả <Icon name="chevron-right" size={14} />
          </button>
        </div>
        {top3.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có dữ liệu bảng xếp hạng.</p>
        ) : (
          <div className="flex justify-around py-1">
            {top3.map((e, i) => (
              <PodiumMini key={e.user_id} entry={e} rank={(i + 1) as 1 | 2 | 3} />
            ))}
          </div>
        )}
      </Card>

      {/* Provinces visited */}
      <PassportSection />



      {/* Moments */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">Khoảnh khắc hành trình</h3>
          <button
            type="button"
            onClick={() => {
              trackEvent("my_checkpoints_open", { source: "profile_moments" });
              setCheckpointsSheetOpen(true);
            }}
            aria-label="Xem tất cả check-in"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition hover:brightness-105 active:scale-95"
          >
            <Icon name="list" size={18} />
          </button>
        </div>
        {momentsLoading ? (
          <div className="flex gap-3 overflow-x-auto px-4 -mx-4 pb-2 scrollbar-none ">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-[140px] shrink-0 rounded-lg snap-start" />
            ))}
          </div>
        ) : myCheckpoints.length === 0 ? (
          <p className="rounded-xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
            Chưa có check-in nào. Mở tab Map và cắm cờ địa điểm đầu tiên!
          </p>
        ) : (
          <div className="flex gap-3 overflow-x-auto px-4 -mx-4 pb-2 scrollbar-none ">
            {myCheckpoints.map((cp) => (
              <MediaPreview
                key={cp.id}
                url={cp.image_url}
                thumbnailUrl={cp.thumbnail_url}
                mediaType={cp.media_type}
                alt={cp.name}
                caption={<MomentCaption cp={cp} />}
                galleryItems={myCheckpoints
                  .filter((item) => item.image_url)
                  .map((item) => ({
                    url: item.image_url,
                    thumbnailUrl: item.thumbnail_url,
                    mediaType: item.media_type,
                    alt: item.name,
                    caption: <MomentCaption cp={item} />,
                  }))}
                galleryIndex={myCheckpoints.filter((item) => item.image_url).findIndex((item) => item.id === cp.id)}
                className="h-28 w-[140px] shrink-0 rounded-lg object-cover snap-start"
                fallback={
                  <ImagePlaceholder
                    className="h-28 w-[140px] shrink-0 snap-start"
                    label={
                      <span className="flex items-center gap-1 text-[11px] truncate px-1.5">
                        <Icon name={categoryIcon(cp.category)} size={14} /> {cp.name}
                      </span>
                    }
                  />
                }
              />
            ))}
          </div>
        )}
      </div>

      <ShareButton
        filename={`checkpoint-${user.username}.png`}
        title={`Hộ chiếu Checkpoint của ${user.display_name || user.username}`}
        text={`Mình đã cắm ${user.checkpoint_count} cờ trên Checkpoint!`}
        url={`${API_URL}/share/user/${user.username}`}
        label="Chia sẻ Hộ chiếu Điện tử"
        render={() =>
          renderProfileCard({
            name: user.display_name || user.username,
            username: user.username,
            level: user.level,
            totalXp: user.total_xp,
            checkpointCount: user.checkpoint_count,
            journeyCount: user.journey_count,
            url: `${API_URL}/share/user/${user.username}`,
          })
        }
      />
      <Button size="lg" variant="outline" icon={<Icon name="log-out" size={20} />} onClick={signOut}>
        {t("profile.logout")}
      </Button>

      <p className="text-center text-xs text-muted-foreground opacity-40">
        build {import.meta.env.VITE_APP_VERSION ?? "dev"}
      </p>

      {editing && <EditProfileSheet onClose={() => setEditing(false)} />}
      {settingsSheetOpen && <SettingsSheet onClose={() => setSettingsSheetOpen(false)} />}
      {checkpointsSheetOpen && <MyCheckpointsSheet onClose={() => setCheckpointsSheetOpen(false)} />}
      {driveToast && <Toast message={driveToast} onDone={() => setDriveToast(null)} />}
    </div>
  );
}

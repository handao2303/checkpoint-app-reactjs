import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { BadgeMedal } from "../components/BadgeMedal";
import { DriveConnectCard } from "../components/DriveConnectCard";
import { EditProfileSheet } from "../components/EditProfileSheet";
import { JourneysSection } from "../components/JourneysSection";
import { MediaPreview } from "../components/MediaPreview";
import { PassportSection } from "../components/PassportSection";
import { ShareButton } from "../components/share/ShareButton";
import { Toast } from "../components/ui/Toast";
import { Button } from "../components/ui/Button";
import { Card, ImagePlaceholder } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";
import { Skeleton } from "../components/ui/Skeleton";
import { UpgradeBanner } from "../components/UpgradeBanner";
import { cn } from "../lib/cn";
import { useCheckin } from "../hooks/useCheckin";
import {
  getBadges,
  getLeaderboard,
  getMyCheckpoints,
  getPassport,
  type Checkpoint,
  type LeaderboardEntry,
  API_URL,
} from "../lib/api";
import { levelTierIconUrl } from "../lib/avatarFrames";
import { categoryIcon } from "../lib/maps";
import { quickCheckinSettings } from "../lib/settings";
import { renderProfileCard } from "../lib/shareCard";
import { trackEvent } from "../lib/observability";

function SettingSwitch({
  checked,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  label: string;
  description: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-lg py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
      </span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-surface-muted"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function MomentCaption({ cp }: { cp?: Checkpoint }) {
  if (!cp) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] bg-gradient-to-t from-black/80 to-transparent p-4 pb-8 text-center text-white">
      <p className="font-display text-lg font-bold">{cp.name}</p>
      {cp.note && <p className="text-sm">{cp.note}</p>}
      {cp.address && (
        <p className="mt-0.5 flex items-center justify-center gap-1 text-xs opacity-80">
          <Icon name="map-pin" size={12} /> {cp.address}
        </p>
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
  const ringClass = { 1: "ring-yellow-400", 2: "ring-slate-400", 3: "ring-amber-600" }[rank];
  const name = entry.display_name || entry.username;
  return (
    <div className="flex flex-1 flex-col items-center gap-1 px-1">
      <div className="relative">
        {entry.avatar_url ? (
          <img src={entry.avatar_url} alt="" className="h-11 w-11 object-contain" />
        ) : (
          <span
            className={`block h-10 w-10 rounded-full bg-gradient-to-br from-primary-300 to-clay-400 ring-2 ${ringClass}`}
          />
        )}
        <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-surface px-1 text-[10px] font-bold text-muted-foreground shadow-sm">
          #{rank}
        </span>
      </div>
      <p className="mt-2 w-full truncate text-center text-xs font-semibold text-foreground">{name}</p>
      <p className="text-[10px] text-muted-foreground">{entry.total_xp.toLocaleString()} XP</p>
    </div>
  );
}

export function ProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openCreateOnLaunch, setOpenCreateOnLaunch] = useState(
    () => quickCheckinSettings.openCreateOnLaunch,
  );
  const [preferCameraOnCheckin, setPreferCameraOnCheckin] = useState(
    () => quickCheckinSettings.preferCameraOnCheckin,
  );
  const { start, sheets } = useCheckin();

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
  const [levelIconLoaded, setLevelIconLoaded] = useState(false);

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
      <div className="relative rounded-2xl bg-[image:var(--gradient-passport)] p-5 text-white shadow-card">
        <button
          onClick={() => {
            trackEvent("profile_edit_open");
            setEditing(true);
          }}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
          aria-label="Sửa hồ sơ"
        >
          <Icon name="pencil" size={16} />
        </button>

        {/* Avatar + info */}
        <div className="flex items-start gap-4">
          <div className="relative shrink-0">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="" className="h-28 w-28 object-contain" />
            ) : (
              <span
                className={`block h-24 w-24 rounded-full bg-white/20 ${avatarRingClass(user.level)}`}
              />
            )}
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-bold text-clay-600 shadow-sm">
              Cấp {user.level}
            </span>
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <h2 className="font-display text-xl font-bold leading-tight">
              {user.display_name || user.username}
            </h2>
            <p className="text-sm text-white/70">@{user.username}</p>
            {user.bio && (
              <p className="mt-1 line-clamp-2 text-xs text-white/80">{user.bio}</p>
            )}
          </div>
        </div>

        {/* Tags */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/80">
          {user.checkin_streak > 0 && (
            <span className="flex items-center gap-1">
              <Icon name="fire" size={12} className="text-orange-300" />
              {user.checkin_streak} ngày liên tiếp
            </span>
          )}
          {firstProvince && (
            <span className="flex items-center gap-1">
              <Icon name="map-pin" size={12} />
              {firstProvince}
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
            { label: "TỔNG XP", value: user.total_xp.toLocaleString() },
            { label: "SỐ CỜ", value: user.checkpoint_count.toString() },
            { label: "HÀNH TRÌNH", value: user.journey_count.toString() },
            { label: "CẤP", value: user.level.toString() },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-white/10 py-2 text-center">
              <p className="text-[10px] text-white/70">{s.label}</p>
              <p className="font-display text-base font-bold">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Badges preview — horizontal scroll */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-lg font-bold">
            <Icon name="award" size={20} className="text-gold" /> Huy hiệu
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
          <div className="flex gap-4 overflow-x-auto pb-1">
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
          <div className="flex gap-4 overflow-x-auto pb-1">
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

      {/* Level card */}
      <Card>
        <div className="flex items-center gap-4">
          <div className="relative h-16 w-16 shrink-0">
            {!levelIconLoaded && (
              <span
                className="absolute inset-0 h-full w-full shrink-0"
                style={{ clipPath: "polygon(50% 5.47%, 85.16% 25.39%, 85.16% 65.23%, 50% 85.16%, 14.84% 65.23%, 14.84% 25.39%)" }}
              >
                <Skeleton className="h-full w-full rounded-none" />
              </span>
            )}
            <img
              src={levelTierIconUrl(user.level)}
              alt=""
              aria-hidden="true"
              onLoad={() => setLevelIconLoaded(true)}
              className={cn(
                "absolute inset-0 h-full w-full object-contain transition-opacity duration-200",
                levelIconLoaded ? "opacity-100" : "opacity-0",
              )}
            />
            {levelIconLoaded && (
              <span className="absolute left-1/2 top-[45%] -translate-x-1/2 -translate-y-1/2 font-display text-xl font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">
                {user.level}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center justify-between">
              <p className="font-semibold text-foreground">Cấp độ hiện tại</p>
              <p className="text-sm text-muted-foreground">{user.total_xp.toLocaleString()} XP</p>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-green-100">
              <div
                className="h-full rounded-full bg-[image:var(--gradient-xp)] transition-[width] duration-500"
                style={{
                  width: `${Math.round(Math.min(1, Math.max(0, user.level_progress)) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-1 text-xs italic text-muted-foreground">
              {user.xp_to_next > 0
                ? `Còn ${user.xp_to_next.toLocaleString()} XP nữa để lên cấp ${user.level + 1}`
                : "Bạn đã đạt cấp tối đa! 🏆"}
            </p>
          </div>
        </div>
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

      {/* Settings */}
      <Card>
        <button
          type="button"
          aria-expanded={settingsOpen}
          aria-controls="profile-settings"
          onClick={() => setSettingsOpen((open) => !open)}
          className="flex w-full items-center gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon name="settings" size={18} className="text-clay-600" />
          <h3 className="flex-1 font-display text-lg font-bold">Cài đặt</h3>
          <Icon
            name="chevron-down"
            size={18}
            className={`text-muted-foreground transition-transform ${settingsOpen ? "rotate-180" : ""}`}
          />
        </button>
        {settingsOpen && (
          <div id="profile-settings" className="mt-2 divide-y divide-border">
            <SettingSwitch
              checked={openCreateOnLaunch}
              label="Check-in luôn khi mở app"
              description="Đi thẳng đến màn hình cắm cờ mỗi khi tải lại hoặc mở app."
              onChange={(checked) => {
                quickCheckinSettings.openCreateOnLaunch = checked;
                setOpenCreateOnLaunch(checked);
                trackEvent("profile_setting_change", { setting: "open_create_on_launch", enabled: checked });
              }}
            />
            <SettingSwitch
              checked={preferCameraOnCheckin}
              label="Ưu tiên chụp ảnh khi check-in"
              description="Tự mở camera một lần khi bắt đầu check-in."
              onChange={(checked) => {
                quickCheckinSettings.preferCameraOnCheckin = checked;
                setPreferCameraOnCheckin(checked);
                trackEvent("profile_setting_change", { setting: "prefer_camera_on_checkin", enabled: checked });
              }}
            />
          </div>
        )}
      </Card>

      {/* Integrations */}
      <Card>
        <div className="mb-1 flex items-center gap-2">
          <Icon name="sparkles" size={18} className="text-clay-600" />
          <h3 className="font-display text-lg font-bold">Tích hợp</h3>
        </div>
        <div className="divide-y divide-border">
          <DriveConnectCard />
        </div>
      </Card>

      {/* Moments */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">Khoảnh khắc hành trình</h3>
          <button
            onClick={start}
            aria-label="Cắm cờ khoảnh khắc mới"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition hover:brightness-105 active:scale-95"
          >
            <Icon name="camera" size={18} />
          </button>
        </div>
        {momentsLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-lg" />
            ))}
          </div>
        ) : myCheckpoints.length === 0 ? (
          <p className="rounded-xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
            Chưa có check-in nào. Mở tab Map và cắm cờ địa điểm đầu tiên!
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
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
                className="h-28 w-full rounded-lg object-cover"
                fallback={
                  <ImagePlaceholder
                    className="h-28"
                    label={
                      <span className="flex items-center gap-1">
                        <Icon name={categoryIcon(cp.category)} size={16} /> {cp.name}
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
        Đăng xuất
      </Button>

      <p className="text-center text-xs text-muted-foreground opacity-40">
        build {import.meta.env.VITE_APP_VERSION ?? "dev"}
      </p>

      {editing && <EditProfileSheet onClose={() => setEditing(false)} />}
      {sheets}
      {driveToast && <Toast message={driveToast} onDone={() => setDriveToast(null)} />}
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { Camera, ChevronDown, LogOut, Pencil, Settings, Trophy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import { Card, ImagePlaceholder } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { useAuth } from "../auth/AuthContext";
import { UpgradeBanner } from "../components/UpgradeBanner";
import { JourneysSection } from "../components/JourneysSection";
import { PassportSection } from "../components/PassportSection";
import { BadgesSection } from "../components/BadgesSection";
import { EditProfileSheet } from "../components/EditProfileSheet";
import { useCheckin } from "../hooks/useCheckin";
import { Skeleton } from "../components/ui/Skeleton";
import { ShareButton } from "../components/share/ShareButton";
import { renderProfileCard } from "../lib/shareCard";
import { getMyCheckpoints, type Checkpoint } from "../lib/api";
import { categoryIcon } from "../lib/maps";
import { quickCheckinSettings } from "../lib/settings";

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
      {cp.address && <p className="mt-0.5 text-xs opacity-80">📍 {cp.address}</p>}
    </div>
  );
}

export function ProfilePage() {
  const { user, signOut } = useAuth();
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
    queryFn: () => getMyCheckpoints(12),
  });
  if (!user) return null;

  // Gallery order = checkpoints that have an image (matches PhotoView render order).
  const withImages = myCheckpoints.filter((cp) => cp.image_url);

  const stats = [
    { label: "TỔNG XP", value: user.total_xp.toLocaleString() },
    { label: "SỐ CỜ", value: user.checkpoint_count.toString() },
    { label: "HÀNH TRÌNH", value: user.journey_count.toString() },
    { label: "CẤP", value: user.level.toString() },
  ];

  return (
    <div className="flex flex-col gap-5 pb-4">
      {user.is_anonymous && <UpgradeBanner />}

      {/* Passport card */}
      <div className="relative rounded-2xl bg-[image:var(--gradient-passport)] p-5 text-white shadow-card">
        <button
          onClick={() => setEditing(true)}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
          aria-label="Sửa hồ sơ"
        >
          <Pencil size={16} />
        </button>
        <div className="flex flex-col items-center gap-2">
          {user.avatar_url ? (
            <img
              src={user.avatar_url}
              alt=""
              className="h-20 w-20 rounded-full border-4 border-white/30 object-cover"
            />
          ) : (
            <span className="h-20 w-20 rounded-full border-4 border-white/30 bg-white/20" />
          )}
          <h2 className="font-display text-2xl font-bold text-white">
            {user.display_name || user.username}
          </h2>
          <span className="rounded-full bg-white/15 px-3 py-1 text-sm">@{user.username}</span>
          {user.bio && <p className="px-2 text-center text-sm text-white/80">{user.bio}</p>}
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg bg-white/10 py-2 text-center">
              <p className="text-xs text-white/70">{s.label}</p>
              <p className="font-display text-lg font-bold">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Passport stamps (provinces visited) */}
      <PassportSection />

      {/* Level progress */}
      <Card>
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-clay-600">CẤP ĐỘ HIỆN TẠI: {user.level}</span>
          <span className="text-muted-foreground">{user.total_xp.toLocaleString()} XP</span>
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-green-100">
          <div
            className="h-full rounded-full bg-[image:var(--gradient-xp)] transition-[width] duration-500"
            style={{ width: `${Math.round(Math.min(1, Math.max(0, user.level_progress)) * 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs italic text-muted-foreground">
          {user.xp_to_next > 0
            ? `Còn ${user.xp_to_next.toLocaleString()} XP nữa để lên cấp ${user.level + 1}`
            : "Bạn đã đạt cấp tối đa! 🏆"}
        </p>
      </Card>

      {/* Leaderboard link */}
      <Link
        to="/leaderboard"
        className="flex items-center gap-3 rounded-xl bg-surface p-4 shadow-card"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/15 text-gold">
          <Trophy size={20} />
        </span>
        <div className="flex-1">
          <p className="font-semibold text-foreground">Bảng xếp hạng</p>
          <p className="text-xs text-muted-foreground">Xem thứ hạng XP của bạn</p>
        </div>
        <span className="text-muted-foreground">›</span>
      </Link>

      <Card>
        <button
          type="button"
          aria-expanded={settingsOpen}
          aria-controls="profile-settings"
          onClick={() => setSettingsOpen((open) => !open)}
          className="flex w-full items-center gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Settings size={18} className="text-clay-600" />
          <h3 className="flex-1 font-display text-lg font-bold">Cài đặt</h3>
          <ChevronDown
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
              }}
            />
            <SettingSwitch
              checked={preferCameraOnCheckin}
              label="Ưu tiên chụp ảnh khi check-in"
              description="Tự mở camera một lần khi bắt đầu check-in trong PWA."
              onChange={(checked) => {
                quickCheckinSettings.preferCameraOnCheckin = checked;
                setPreferCameraOnCheckin(checked);
              }}
            />
          </div>
        )}
      </Card>

      {/* Badges */}
      <BadgesSection />

      {/* Journeys */}
      <JourneysSection />

      {/* Moments */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">Khoảnh khắc hành trình</h3>
          <button
            onClick={start}
            aria-label="Cắm cờ khoảnh khắc mới"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition hover:brightness-105 active:scale-95"
          >
            <Camera size={18} />
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
          <PhotoProvider overlayRender={({ index }) => <MomentCaption cp={withImages[index]} />}>
            <div className="grid grid-cols-2 gap-3">
              {myCheckpoints.map((cp) =>
                cp.image_url ? (
                  <PhotoView key={cp.id} src={cp.image_url}>
                    <img
                      src={cp.thumbnail_url ?? cp.image_url}
                      alt={cp.name}
                      className="h-28 w-full cursor-zoom-in rounded-lg object-cover"
                    />
                  </PhotoView>
                ) : (
                  <ImagePlaceholder
                    key={cp.id}
                    className="h-28"
                    label={`${categoryIcon(cp.category)} ${cp.name}`}
                  />
                ),
              )}
            </div>
          </PhotoProvider>
        )}
      </div>

      <ShareButton
        filename={`checkpoint-${user.username}.png`}
        title={`Hộ chiếu Checkpoint của ${user.display_name || user.username}`}
        text={`Mình đã cắm ${user.checkpoint_count} cờ trên Checkpoint!`}
        url={window.location.origin}
        label="Chia sẻ Hộ chiếu Điện tử"
        render={() =>
          renderProfileCard({
            name: user.display_name || user.username,
            username: user.username,
            level: user.level,
            totalXp: user.total_xp,
            checkpointCount: user.checkpoint_count,
            journeyCount: user.journey_count,
          })
        }
      />
      <Button size="lg" variant="outline" icon={<LogOut size={20} />} onClick={signOut}>
        Đăng xuất
      </Button>

      <p className="text-center text-xs text-muted-foreground opacity-40">
        build {import.meta.env.VITE_APP_VERSION ?? "dev"}
      </p>

      {editing && <EditProfileSheet onClose={() => setEditing(false)} />}
      {sheets}
    </div>
  );
}

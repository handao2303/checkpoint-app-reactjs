import { useState } from "react";
import { Link } from "react-router-dom";
import { Share2, Camera, LogOut, Pencil, Trophy } from "lucide-react";
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
import { getMyCheckpoints, type Checkpoint } from "../lib/api";
import { categoryIcon } from "../lib/maps";

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
  const { data: myCheckpoints = [] } = useQuery({
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
    <div className="flex flex-col gap-5 pb-24">
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

      {/* Badges */}
      <BadgesSection />

      {/* Journeys */}
      <JourneysSection />

      {/* Moments */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">Khoảnh khắc hành trình</h3>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Camera size={18} />
          </span>
        </div>
        {myCheckpoints.length === 0 ? (
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
                      src={cp.image_url}
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

      <Button size="lg" variant="green" icon={<Share2 size={20} />}>
        Chia sẻ Hộ chiếu Điện tử
      </Button>
      <Button size="lg" variant="outline" icon={<LogOut size={20} />} onClick={signOut}>
        Đăng xuất
      </Button>

      {editing && <EditProfileSheet onClose={() => setEditing(false)} />}
    </div>
  );
}

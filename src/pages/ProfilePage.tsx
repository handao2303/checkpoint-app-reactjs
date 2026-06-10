import { Share2, Mountain, Utensils, Bike, Lock, Camera, LogOut } from "lucide-react";
import { Card, ImagePlaceholder } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { useAuth } from "../auth/AuthContext";
import { UpgradeBanner } from "../components/UpgradeBanner";

const badges = [
  { name: "Chinh phục Fansipan", Icon: Mountain, locked: false },
  { name: "Thánh ăn đêm", Icon: Utensils, locked: false },
  { name: "Phượt Thủ Bền Bỉ", Icon: Bike, locked: false },
  { name: "Ẩm thực cung đình", Icon: Lock, locked: true },
];

export function ProfilePage() {
  const { user, signOut } = useAuth();
  if (!user) return null;

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
      <div className="rounded-2xl bg-[image:var(--gradient-passport)] p-5 text-white shadow-card">
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

      {/* Level progress */}
      <Card>
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-clay-600">CẤP ĐỘ HIỆN TẠI: {user.level}</span>
          <span className="text-muted-foreground">{user.total_xp.toLocaleString()} XP</span>
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-green-100">
          <div className="h-full w-[85%] rounded-full bg-[image:var(--gradient-xp)]" />
        </div>
        <p className="mt-2 text-xs italic text-muted-foreground">
          Còn 150 XP nữa để đạt danh hiệu 'Đại sứ Di sản'
        </p>
      </Card>

      {/* Badges */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">Bộ sưu tập Huy hiệu</h3>
          <button className="text-sm font-semibold text-primary">Xem tất cả</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {badges.map(({ name, Icon, locked }) => (
            <Card
              key={name}
              className={`flex flex-col items-center gap-2 py-4 ${locked ? "opacity-50" : ""}`}
            >
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-full ${
                  locked ? "bg-surface-muted text-subtle-foreground" : "bg-primary-50 text-primary"
                }`}
              >
                <Icon size={22} />
              </span>
              <p className="text-center text-sm font-medium">{name}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* Moments */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">Khoảnh khắc hành trình</h3>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Camera size={18} />
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <ImagePlaceholder className="h-28" label="Hạ Long" />
          <ImagePlaceholder className="h-28" label="Phố cổ Hà Nội" />
          <ImagePlaceholder className="col-span-2 h-44" label="Mù Cang Chải" />
        </div>
      </div>

      <Button size="lg" variant="green" icon={<Share2 size={20} />}>
        Chia sẻ Hộ chiếu Điện tử
      </Button>
      <Button size="lg" variant="outline" icon={<LogOut size={20} />} onClick={signOut}>
        Đăng xuất
      </Button>
    </div>
  );
}

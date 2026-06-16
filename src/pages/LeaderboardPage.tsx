import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getLeaderboard, type LeaderboardEntry } from "../lib/api";
import { Icon, type IconName } from "../components/ui/Icon";
import { XPBadge } from "../components/ui/Chip";
import { Skeleton } from "../components/ui/Skeleton";
import { UserProfileSheet } from "../components/UserProfileSheet";
import { trackEvent } from "../lib/observability";

const PODIUM_STYLE = [
  // index 0 → rank #1 (center, tallest)
  {
    order: "order-2",
    avatarSize: "h-16 w-16",
    ring: "ring-4 ring-yellow-400",
    rankBg: "bg-yellow-400 text-yellow-900",
    mt: "mt-0",
  },
  // index 1 → rank #2 (left)
  {
    order: "order-1",
    avatarSize: "h-12 w-12",
    ring: "ring-4 ring-slate-400",
    rankBg: "bg-slate-400 text-white",
    mt: "mt-6",
  },
  // index 2 → rank #3 (right)
  {
    order: "order-3",
    avatarSize: "h-12 w-12",
    ring: "ring-4 ring-amber-700",
    rankBg: "bg-amber-700 text-white",
    mt: "mt-6",
  },
];

const RANK_LABELS: { name: IconName; className: string }[] = [
  { name: "medal", className: "text-gold" },
  { name: "medal", className: "text-slate-400" },
  { name: "medal", className: "text-amber-700" },
];

function rankLabel(rank: number): ReactNode {
  const medal = RANK_LABELS[rank - 1];
  return medal ? (
    <Icon name={medal.name} size={22} className={`mx-auto ${medal.className}`} />
  ) : (
    `#${rank}`
  );
}

function PodiumCard({
  entry,
  style,
  isMe,
  onOpen,
}: {
  entry: LeaderboardEntry;
  style: (typeof PODIUM_STYLE)[0];
  isMe: boolean;
  onOpen: () => void;
}) {
  const name = entry.display_name || entry.username;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${style.order} ${style.mt} flex flex-1 flex-col items-center gap-1.5 rounded-2xl p-3 text-center transition hover:brightness-95 active:scale-[0.98] ${
        isMe ? "bg-primary-50 ring-2 ring-primary" : "bg-surface shadow-card"
      }`}
    >
      <div className="relative">
        {entry.avatar_url ? (
          <img src={entry.avatar_url} alt="" className={`object-contain ${style.avatarSize}`} />
        ) : (
          <span
            className={`block rounded-full bg-gradient-to-br from-primary-300 to-clay-400 ${style.avatarSize} ${style.ring}`}
          />
        )}
        <span
          className={`absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full px-1.5 py-0.5 text-xs font-bold ${style.rankBg}`}
        >
          #{entry.rank}
        </span>
      </div>
      <p className="mt-2 line-clamp-1 text-xs font-semibold text-foreground">{name}</p>
      <p className="text-xs text-muted-foreground">Cấp {entry.level}</p>
      <XPBadge xp={entry.total_xp} />
    </button>
  );
}

function Row({
  entry,
  highlight,
  onOpen,
}: {
  entry: LeaderboardEntry;
  highlight: boolean;
  onOpen: () => void;
}) {
  const name = entry.display_name || entry.username;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition hover:brightness-95 active:scale-[0.99] ${
        highlight ? "bg-primary-50 ring-1 ring-primary" : "bg-surface shadow-card"
      }`}
    >
      <span className="w-9 text-center font-display text-lg font-bold text-clay-600">
        {rankLabel(entry.rank)}
      </span>
      {entry.avatar_url ? (
        <img src={entry.avatar_url} alt="" className="h-11 w-11 shrink-0 object-contain" />
      ) : (
        <span className="h-10 w-10 rounded-full bg-gradient-to-br from-primary-300 to-clay-400" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-foreground">{name}</p>
        <p className="text-xs text-muted-foreground">Cấp {entry.level}</p>
      </div>
      <XPBadge xp={entry.total_xp} />
    </button>
  );
}

export function LeaderboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ["leaderboard"], queryFn: getLeaderboard });
  const entries = data?.entries ?? [];
  const me = data?.me;
  const meInTop = me != null && entries.some((e) => e.user_id === me.user_id);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-clay-600">
          <Icon name="trophy" size={26} className="text-gold" /> Bảng xếp hạng
        </h1>
        <p className="text-sm text-muted-foreground">Nhà thám hiểm nổi bật tuần này</p>
      </div>

      {isLoading ? (
        <>
          {/* Podium skeleton */}
          <div className="flex items-end gap-2">
            {[1, 0, 2].map((i) => (
              <div key={i} className={`flex flex-1 flex-col items-center gap-2 rounded-2xl bg-surface p-3 shadow-card ${i === 0 ? "mt-0" : "mt-6"}`}>
                <Skeleton className="h-14 w-14 rounded-full" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-3 w-10" />
              </div>
            ))}
          </div>
          {/* List skeleton */}
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl bg-surface p-3 shadow-card">
                <Skeleton className="h-6 w-6 rounded" />
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-6 w-14 rounded-full" />
              </div>
            ))}
          </div>
        </>
      ) : entries.length === 0 ? (
        <p className="rounded-xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
          Chưa có ai trên bảng xếp hạng. Hãy check-in để ghi điểm!
        </p>
      ) : (
        <>
          {/* Top 3 podium */}
          {top3.length > 0 && (
            <div className="flex items-end gap-2">
              {/* Render order: #2 left, #1 center, #3 right using CSS order */}
              {top3.map((e, idx) => (
                <PodiumCard
                  key={e.user_id}
                  entry={e}
                  style={PODIUM_STYLE[idx]}
                  isMe={e.user_id === me?.user_id}
                  onOpen={() => {
                    trackEvent("leaderboard_profile_open", { rank: e.rank });
                    setProfileUsername(e.username);
                  }}
                />
              ))}
            </div>
          )}

          {/* Rank 4+ list */}
          {rest.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-muted-foreground">Các vị trí tiếp theo</p>
              </div>
              {rest.map((e) => (
                <Row
                  key={e.user_id}
                  entry={e}
                  highlight={e.user_id === me?.user_id}
                  onOpen={() => {
                    trackEvent("leaderboard_profile_open", { rank: e.rank });
                    setProfileUsername(e.username);
                  }}
                />
              ))}
            </div>
          )}

          {/* Pinned caller row if outside top list */}
          {me && !meInTop && (
            <>
              <p className="pt-2 text-center text-xs text-muted-foreground">• • •</p>
              <Row
                entry={me}
                highlight
                onOpen={() => {
                  trackEvent("leaderboard_profile_open", { rank: me.rank });
                  setProfileUsername(me.username);
                }}
              />
            </>
          )}
        </>
      )}

      {profileUsername && (
        <UserProfileSheet username={profileUsername} onClose={() => setProfileUsername(null)} />
      )}
    </div>
  );
}

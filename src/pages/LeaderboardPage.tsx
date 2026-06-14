import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getLeaderboard, type LeaderboardEntry } from "../lib/api";
import { Icon, type IconName } from "../components/ui/Icon";
import { XPBadge } from "../components/ui/Chip";
import { Skeleton } from "../components/ui/Skeleton";
import { UserProfileSheet } from "../components/UserProfileSheet";

// Rank 1–3 get a colored medal icon; everyone else shows "#N".
const MEDALS: { name: IconName; className: string }[] = [
  { name: "medal", className: "text-gold" },
  { name: "medal", className: "text-slate-400" },
  { name: "medal", className: "text-amber-700" },
];

function rankLabel(rank: number): ReactNode {
  const medal = MEDALS[rank - 1];
  return medal ? (
    <Icon name={medal.name} size={24} className={`mx-auto ${medal.className}`} />
  ) : (
    `#${rank}`
  );
}

export function LeaderboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ["leaderboard"], queryFn: getLeaderboard });
  const entries = data?.entries ?? [];
  const me = data?.me;
  const meInTop = me != null && entries.some((e) => e.user_id === me.user_id);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4 pb-4">
      <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-clay-600">
        <Icon name="trophy" size={26} className="text-gold" /> Bảng xếp hạng
      </h1>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
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
      ) : entries.length === 0 ? (
        <p className="rounded-xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
          Chưa có ai trên bảng xếp hạng. Hãy check-in để ghi điểm!
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((e) => (
            <Row
              key={e.user_id}
              entry={e}
              highlight={e.user_id === me?.user_id}
              onOpen={() => setProfileUsername(e.username)}
            />
          ))}

          {/* Pin the caller's row at the bottom if they're outside the top list. */}
          {me && !meInTop && (
            <>
              <p className="pt-2 text-center text-xs text-muted-foreground">• • •</p>
              <Row entry={me} highlight onOpen={() => setProfileUsername(me.username)} />
            </>
          )}
        </div>
      )}

      {profileUsername && (
        <UserProfileSheet username={profileUsername} onClose={() => setProfileUsername(null)} />
      )}
    </div>
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
        <img src={entry.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
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

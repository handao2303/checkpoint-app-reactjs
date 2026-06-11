import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { getLeaderboard, type LeaderboardEntry } from "../lib/api";
import { XPBadge } from "../components/ui/Chip";

const MEDALS = ["🥇", "🥈", "🥉"];

function rankLabel(rank: number): string {
  return MEDALS[rank - 1] ?? `#${rank}`;
}

export function LeaderboardPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["leaderboard"], queryFn: getLeaderboard });
  const entries = data?.entries ?? [];
  const me = data?.me;
  const meInTop = me != null && entries.some((e) => e.user_id === me.user_id);

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          className="rounded-full p-1.5 text-clay-600 hover:bg-surface-muted"
          aria-label="Quay lại"
        >
          <ChevronLeft size={22} />
        </button>
        <h1 className="font-display text-2xl font-bold text-clay-600">🏆 Bảng xếp hạng</h1>
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-muted-foreground">Đang tải...</p>
      ) : entries.length === 0 ? (
        <p className="rounded-xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
          Chưa có ai trên bảng xếp hạng. Hãy check-in để ghi điểm!
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((e) => (
            <Row key={e.user_id} entry={e} highlight={e.user_id === me?.user_id} />
          ))}

          {/* Pin the caller's row at the bottom if they're outside the top list. */}
          {me && !meInTop && (
            <>
              <p className="pt-2 text-center text-xs text-muted-foreground">• • •</p>
              <Row entry={me} highlight />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ entry, highlight }: { entry: LeaderboardEntry; highlight: boolean }) {
  const name = entry.display_name || entry.username;
  return (
    <div
      className={`flex items-center gap-3 rounded-xl p-3 ${
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
    </div>
  );
}

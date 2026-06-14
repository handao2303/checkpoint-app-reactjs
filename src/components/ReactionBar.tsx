import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon, type IconName } from "./ui/Icon";
import { clearReaction, getReactions, setReaction, type ReactionSummary } from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import { cn } from "../lib/cn";

// The fixed reaction set — keys match the backend AllowedReactions and the SVG
// icon registry. `fill` flags glyphs that read well filled when active.
const REACTIONS: { key: string; icon: IconName; label: string; activeClass: string; fill?: boolean }[] = [
  { key: "like", icon: "like", label: "Thích", activeClass: "text-primary", fill: true },
  { key: "love", icon: "love", label: "Yêu thích", activeClass: "text-rose-500", fill: true },
  { key: "fire", icon: "fire", label: "Tuyệt vời", activeClass: "text-orange-500", fill: true },
  { key: "haha", icon: "haha", label: "Haha", activeClass: "text-gold" },
  { key: "sad", icon: "sad", label: "Buồn", activeClass: "text-sky-500" },
];

const EMPTY: ReactionSummary = { counts: {}, total: 0, mine: null };

/** Apply a reaction change to a summary, for optimistic UI. Passing null clears
 *  the caller's reaction; otherwise it sets/switches it. */
function applyOptimistic(prev: ReactionSummary, next: string | null): ReactionSummary {
  const counts = { ...prev.counts };
  let total = prev.total;
  if (prev.mine) {
    counts[prev.mine] = Math.max(0, (counts[prev.mine] ?? 0) - 1);
    total -= 1;
  }
  if (next) {
    counts[next] = (counts[next] ?? 0) + 1;
    total += 1;
  }
  return { counts, total, mine: next };
}

export function ReactionBar({ checkpointId }: { checkpointId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["reactions", checkpointId];

  const { data = EMPTY } = useQuery({
    queryKey: key,
    queryFn: () => getReactions(checkpointId),
  });
  const mine = data.mine ?? null;

  const mutation = useMutation({
    mutationFn: (reaction: string | null) =>
      reaction ? setReaction(checkpointId, reaction) : clearReaction(checkpointId),
    onMutate: async (reaction) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ReactionSummary>(key) ?? EMPTY;
      qc.setQueryData(key, applyOptimistic(prev, reaction));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSuccess: (summary) => qc.setQueryData(key, summary),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  function toggle(reaction: string) {
    if (!user || mutation.isPending) return;
    mutation.mutate(mine === reaction ? null : reaction);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
      {REACTIONS.map((r) => {
        const count = data.counts[r.key] ?? 0;
        const active = mine === r.key;
        return (
          <button
            key={r.key}
            onClick={() => toggle(r.key)}
            disabled={!user || mutation.isPending}
            aria-pressed={active}
            aria-label={r.label}
            className={cn(
              "flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition disabled:opacity-50",
              active
                ? `border-current ${r.activeClass} bg-surface-muted font-semibold`
                : "border-border text-muted-foreground hover:bg-surface-muted",
            )}
          >
            <Icon name={r.icon} size={16} className={active && r.fill ? "fill-current" : undefined} />
            {count > 0 && <span>{count}</span>}
          </button>
        );
      })}
      {data.total > 0 && (
        <span className="ml-auto text-xs text-muted-foreground">{data.total}</span>
      )}
    </div>
  );
}

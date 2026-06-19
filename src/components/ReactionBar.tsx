import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Icon, type IconName } from "./ui/Icon";
import { Button } from "./ui/Button";
import { Sheet } from "./ui/Sheet";
import { clearReaction, getReactions, setReaction, type ReactionSummary } from "../lib/api";
import { addReactionNotification } from "../lib/notifications";
import { useAuth } from "../auth/AuthContext";
import { cn } from "../lib/cn";
import { trackEvent } from "../lib/observability";

type Reaction = { key: string; icon: IconName; label: string; activeClass: string; fill?: boolean };

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

export function ReactionBar({
  checkpointId,
  ownerUserId,
  checkpointName,
}: {
  checkpointId: string;
  ownerUserId: string;
  checkpointName: string;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const qc = useQueryClient();
  const key = ["reactions", checkpointId];

  // The fixed reaction set — keys match the backend AllowedReactions and the SVG
  // icon registry. `fill` flags glyphs that read well filled when active.
  const REACTIONS: Reaction[] = useMemo(
    () => [
      { key: "like", icon: "like", label: t('thich'), activeClass: "text-primary", fill: true },
      { key: "love", icon: "love", label: t('yeu_thich'), activeClass: "text-rose-500", fill: true },
      { key: "fire", icon: "fire", label: t('tuyet_voi'), activeClass: "text-orange-500", fill: true },
      { key: "haha", icon: "haha", label: "Haha", activeClass: "text-gold" },
      { key: "sad", icon: "sad", label: t('buon'), activeClass: "text-sky-500" },
    ],
    [t],
  );

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
      trackEvent(_v ? "reaction_set_failed" : "reaction_clear_failed", { checkpoint_id: checkpointId });
    },
    onSuccess: (summary, reaction) => {
      qc.setQueryData(key, summary);
      trackEvent(reaction ? "reaction_set_success" : "reaction_clear_success", {
        checkpoint_id: checkpointId,
        reaction: reaction ?? undefined,
      });
      // Notify the owner only when setting/switching a reaction (not clearing).
      if (reaction && user) {
        void addReactionNotification(
          ownerUserId,
          {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            avatar_url: user.avatar_url,
          },
          checkpointId,
          checkpointName,
          reaction,
        );
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  function toggle(reaction: string) {
    if (!user) {
      setShowLoginPrompt(true);
      return;
    }
    if (mutation.isPending) return;
    mutation.mutate(mine === reaction ? null : reaction);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {REACTIONS.map((r) => {
          const count = data.counts[r.key] ?? 0;
          const active = mine === r.key;
          return (
            <button
              key={r.key}
              onClick={() => toggle(r.key)}
              disabled={mutation.isPending}
              aria-pressed={active}
              aria-label={r.label}
              className={cn(
                "flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition disabled:opacity-50 cursor-pointer",
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
        {/* {data.total > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">{data.total}</span>
        )} */}
      </div>

      {showLoginPrompt && (
        <Sheet title={t('dang_nhap_de_su_dung')} onClose={() => setShowLoginPrompt(false)}>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {t('dang_nhap_de_tha_cam')}
            </p>
            <Button onClick={() => navigate("/login")}>{t('dang_nhap')}</Button>
          </div>
        </Sheet>
      )}
    </>
  );
}

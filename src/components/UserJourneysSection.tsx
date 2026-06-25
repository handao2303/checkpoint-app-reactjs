import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { getUserJourneys } from "../lib/api";
import { Icon } from "./ui/Icon";
import { Skeleton } from "./ui/Skeleton";
import { trackEvent } from "../lib/observability";

// Lazy so MapLibre loads only when a journey is opened (mirrors JourneysSection).
const JourneyDetailSheet = lazy(() =>
  import("./JourneyDetailSheet").then((m) => ({ default: m.JourneyDetailSheet })),
);

/** Read-only list of another user's journeys, filtered server-side by visibility.
 *  Tapping one opens the same JourneyDetailSheet used on the owner's own profile. */
export function UserJourneysSection({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: journeys = [], isLoading } = useQuery({
    queryKey: ["user-journeys", userId],
    queryFn: () => getUserJourneys(userId),
    enabled: !!userId,
  });

  return (
    <div>
      <h3 className="mb-2 font-display text-lg font-bold">{t("hanh_trinh")}</h3>
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : journeys.length === 0 ? (
        <p className="rounded-xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
          {t("chua_co_hanh_trinh_nao")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {journeys.map((j) => (
            <button
              key={j.id}
              type="button"
              onClick={() => {
                trackEvent("journey_detail_open", { journey_id: j.id, source: "user_profile" });
                setOpenId(j.id);
              }}
              className="flex items-center gap-3 rounded-xl bg-surface p-3 text-left shadow-card"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary">
                <Icon name="route" size={20} className="text-primary" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">{j.title}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(j.created_at).toLocaleDateString("vi-VN")}
                  {j.is_active && ` ${t("dang_di")}`}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {openId && (
        <Suspense fallback={null}>
          <JourneyDetailSheet id={openId} onClose={() => setOpenId(null)} />
        </Suspense>
      )}
    </div>
  );
}

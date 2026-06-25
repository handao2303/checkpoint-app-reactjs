import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  getUserFollowers,
  getUserFollowingList,
  type PublicUserSummary,
} from "../lib/api";
import { Button } from "./ui/Button";
import { Sheet } from "./ui/Sheet";
import { Skeleton } from "./ui/Skeleton";
import { UserAvatar } from "./ui/UserAvatar";

type FollowTab = "followers" | "following";

interface ProfileFollowSectionProps {
  userRef: string;
  onOpenProfile: (userId: string) => void;
}

export function ProfileFollowSection({ userRef, onOpenProfile }: ProfileFollowSectionProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<FollowTab>("followers");
  const [open, setOpen] = useState(false);

  const followers = useQuery({
    queryKey: ["user-followers", userRef],
    queryFn: () => getUserFollowers(userRef),
  });
  const following = useQuery({
    queryKey: ["user-following-list", userRef],
    queryFn: () => getUserFollowingList(userRef),
  });

  const active = tab === "followers" ? followers : following;
  const people = active.data ?? [];
  const emptyText = tab === "followers" ? t("chua_co_nguoi_theo_doi") : t("chua_theo_doi_ai_bam");

  function openTab(nextTab: FollowTab) {
    setTab(nextTab);
    setOpen(true);
  }

const btnClassName="w-full rounded-md bg-surface-muted px-3 py-1.5 font-semibold text-foreground transition hover:bg-primary-50 hover:text-primary border border-border"


  return (
    <>
      <div className="mt-2 flex items-center gap-1 text-xs justify-between">
        <button
          type="button"
          onClick={() => openTab("followers")}
          className={btnClassName}
        >
          <span className="font-display text-sm font-extrabold">
            {followers.isLoading ? "..." : (followers.data?.length ?? 0).toLocaleString()}
          </span>{" "}
          <span className="text-muted-foreground">{t("nguoi_theo_doi")}</span>
        </button>
        <button
          type="button"
          onClick={() => openTab("following")}
          className={btnClassName}
        >
          <span className="font-display text-sm font-extrabold">
            {following.isLoading ? "..." : (following.data?.length ?? 0).toLocaleString()}
          </span>{" "}
          <span className="text-muted-foreground">{t("dang_theo_doi")}</span>
        </button>
      </div>

      {open && (
        <Sheet title={tab === "followers" ? t("nguoi_theo_doi") : t("dang_theo_doi")} onClose={() => setOpen(false)}>
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-full bg-surface-muted p-1">
            {(["followers", "following"] as const).map((key) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={tab === key ? "primary" : "ghost"}
                className="rounded-full"
                onClick={() => setTab(key)}
              >
                {key === "followers" ? t("nguoi_theo_doi") : t("dang_theo_doi")}
              </Button>
            ))}
          </div>

          {active.isLoading ? (
            <FollowListSkeleton />
          ) : people.length === 0 ? (
            <p className="rounded-xl bg-surface-muted p-4 text-center text-sm text-muted-foreground">
              {emptyText}
            </p>
          ) : (
            <div className="flex max-h-[60dvh] flex-col gap-1 overflow-y-auto pr-1">
              {people.map((person) => (
                <FollowPersonRow
                  key={person.id}
                  person={person}
                  onOpenProfile={(userId) => {
                    setOpen(false);
                    onOpenProfile(userId);
                  }}
                />
              ))}
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}

function FollowPersonRow({
  person,
  onOpenProfile,
}: {
  person: PublicUserSummary;
  onOpenProfile: (userId: string) => void;
}) {
  const name = person.display_name || person.username;
  return (
    <button
      type="button"
      onClick={() => onOpenProfile(person.id)}
      className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-primary-50"
      aria-label={name}
    >
      <UserAvatar
        src={person.avatar_url}
        name={person.display_name}
        username={person.username}
        className="h-10 w-10"
        fallbackClassName="bg-primary-50 text-primary"
      />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
        <span className="block truncate text-xs text-muted-foreground">@{person.username}</span>
      </span>
    </button>
  );
}

function FollowListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl px-2 py-2">
          <Skeleton className="h-10 w-10 rounded-full" />
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </span>
        </div>
      ))}
    </div>
  );
}

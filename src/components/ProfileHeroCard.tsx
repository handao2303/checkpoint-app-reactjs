import type { ReactNode } from "react";
import type { User } from "../lib/api";
import { ProfileFollowSection } from "./ProfileFollowSection";
import { ProfileHeader } from "./ProfileHeader";

export interface ProfileStat {
  label: string;
  value: string;
}

interface ProfileHeroCardProps {
  user: User;
  stats: ProfileStat[];
  onOpenProfile: (userId: string) => void;
  province?: string;
  actions?: ReactNode;
}

export function ProfileHeroCard({
  user,
  stats,
  onOpenProfile,
  province,
  actions,
}: ProfileHeroCardProps) {

  return (
    <div className="relative rounded-2xl border border-border bg-surface p-5 text-foreground shadow-card">
      {actions}
      <ProfileHeader user={user} province={province} onOpenProfile={onOpenProfile} />
      <ProfileFollowSection userRef={user.id} onOpenProfile={onOpenProfile} />
      {/* Stats */}
      <div className="mt-2 flex w-full items-stretch justify-between gap-1">
        {stats.map((s) => (
          <div key={s.label} className="w-full rounded-lg border border-border bg-surface-muted px-2.5 py-2 text-center">
            <p className="truncate whitespace-nowrap text-[10px] font-semibold text-muted-foreground">{s.label}</p>
            <p className="truncate whitespace-nowrap font-display text-base font-extrabold text-clay-800">{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

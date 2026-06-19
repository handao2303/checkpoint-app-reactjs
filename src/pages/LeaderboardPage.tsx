import { t } from "../lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../components/ui/Icon";
import { Skeleton } from "../components/ui/Skeleton";
import { UserAvatar } from "../components/ui/UserAvatar";
import { UserProfileSheet } from "../components/UserProfileSheet";
import { getLeaderboard, type LeaderboardEntry } from "../lib/api";
import { trackEvent } from "../lib/observability";

const xpFormatter = new Intl.NumberFormat("vi-VN");
const PODIUM_STYLE = [
  {
    order: "order-2",
    width: "min-w-[112px] flex-[1.22]",
    avatarStage: "h-[7rem]",
    avatarWithImage: "h-[6.25rem] w-[6.25rem]",
    avatarFallback: "h-[5.25rem] w-[5.25rem]",
    medal: "bg-gold text-neutral-900 ring-gold/30",
    frame: "border-gold/45 bg-primary-50 shadow-lg",
    lift: "-translate-y-6",
  },
  {
    order: "order-1",
    width: "min-w-[94px] flex-1",
    avatarStage: "h-[5.75rem]",
    avatarWithImage: "h-20 w-20",
    avatarFallback: "h-16 w-16",
    medal: "bg-neutral-300 text-neutral-800 ring-neutral-300/40",
    frame: "border-neutral-300/70 bg-surface shadow-card",
    lift: "translate-y-1",
  },
  {
    order: "order-3",
    width: "min-w-[94px] flex-1",
    avatarStage: "h-[5.75rem]",
    avatarWithImage: "h-20 w-20",
    avatarFallback: "h-16 w-16",
    medal: "bg-clay-300 text-clay-900 ring-clay-300/35",
    frame: "border-clay-300/55 bg-surface shadow-card",
    lift: "translate-y-3",
  },
];

function displayName(entry: LeaderboardEntry) {
  return entry.display_name || entry.username;
}

function formatXP(xp: number) {
  return xpFormatter.format(xp);
}

function openProfile(
  entry: LeaderboardEntry,
  setProfileUsername: (username: string) => void,
) {
  trackEvent("leaderboard_profile_open", { rank: entry.rank });
  setProfileUsername(entry.username);
}

function XPValue({ xp, compact = false }: { xp: number; compact?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-primary-200 bg-primary-50 font-bold text-primary-600 ${
        compact ? "px-2 py-1 text-xs" : "px-2.5 py-1 text-sm"
      }`}
    >
      <Icon name="xp-coin" size={compact ? 14 : 16} aria-hidden="true" />
      {formatXP(xp)}
    </span>
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
  const name = displayName(entry);
  const hasAvatar = Boolean(entry.avatar_url);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${style.order} ${style.width} ${style.lift} group flex flex-col items-center rounded-2xl border p-2.5 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.99] ${
        isMe ? "border-primary bg-primary-50" : style.frame
      }`}
      aria-label={t('mo_ho_so_name_hang', { name: name, rank: entry.rank })}
    >
      <div className={`flex w-full items-center justify-center ${style.avatarStage}`}>
        <div className="relative">
          <UserAvatar
            src={entry.avatar_url}
            name={name}
            username={entry.username}
            className={hasAvatar ? style.avatarWithImage : style.avatarFallback}
            fallbackClassName="bg-primary-50 text-primary"
            fit="cover"
            loading={entry.rank === 1 ? "eager" : "lazy"}
          />
          <span
            className={`absolute -top-2 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-black ring-4 ${style.medal}`}
          >
            <Icon name={entry.rank === 1 ? "trophy" : "medal"} size={14} aria-hidden="true" />
            {entry.rank}
          </span>
        </div>
      </div>
      <p
        className="mt-2 min-w-0 max-w-full truncate px-1 text-sm font-bold leading-tight text-foreground"
        title={name}
      >
        {name}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">Lv. {entry.level}</p>
      <div className="mt-2">
        <XPValue xp={entry.total_xp} compact={entry.rank !== 1} />
      </div>
    </button>
  );
}

function LeaderboardRow({
  entry,
  highlight,
  onOpen,
}: {
  entry: LeaderboardEntry;
  highlight: boolean;
  onOpen: () => void;
}) {
  const name = displayName(entry);
  const hasAvatar = Boolean(entry.avatar_url);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`grid w-full grid-cols-[2.25rem_3.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border p-3 text-left shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.995] ${
        highlight
          ? "border-primary bg-primary-50"
          : "border-border bg-surface hover:border-primary-200"
      }`}
      aria-label={t('mo_ho_so_name_hang', { name, rank: entry.rank })}
    >
      <span className="text-center font-display text-xl font-black text-clay-700">
        {entry.rank}
      </span>
      <span className="flex h-14 w-14 items-center justify-center">
        <UserAvatar
          src={entry.avatar_url}
          name={name}
          username={entry.username}
          className={hasAvatar ? "h-14 w-14" : "h-11 w-11"}
          fallbackClassName="bg-primary-50 text-primary"
          fit="cover"
        />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-bold text-foreground">{name}</span>
        <span className="mt-1 inline-flex rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-xs font-semibold text-clay-700">
          Lv. {entry.level}
        </span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <XPValue xp={entry.total_xp} compact />
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Icon name="flag" size={14} aria-hidden="true" />
          {t('hang_rank', { rank: entry.rank })}
        </span>
      </span>
    </button>
  );
}

function HeaderStats({ entries, me }: { entries: LeaderboardEntry[]; me?: LeaderboardEntry }) {
  const { t } = useTranslation();
  const topXP = entries[0]?.total_xp ?? 0;
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1 rounded-full bg-neutral-0/80 py-1 text-xs font-semibold text-clay-600">
            <Icon name="calendar" size={14} aria-hidden="true" />
            {t('tuan_kham_pha')}
          </p>
          <h1 className="flex items-center gap-2 font-display text-3xl font-black text-clay-800">
            {t('bang_xep_hang')}
          </h1>
        </div>
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-gold/35 bg-gold/15 text-gold">
          <Icon name="trophy" size={30} aria-hidden="true" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-primary-100 bg-neutral-0/70 p-2">
          <p className="text-[11px] font-semibold text-muted-foreground">{t('top_xp')}</p>
            <p className="mt-1 truncate font-display text-base font-black text-primary">
            {formatXP(topXP)}
          </p>
        </div>
        <div className="rounded-xl border border-primary-100 bg-neutral-0/70 p-2">
          <p className="text-[11px] font-semibold text-muted-foreground">{t('nguoi_choi')}</p>
          <p className="mt-1 font-display text-base font-black text-clay-700">
            {entries.length}
          </p>
        </div>
        <div className="rounded-xl border border-primary-100 bg-neutral-0/70 p-2">
          <p className="text-[11px] font-semibold text-muted-foreground">{t('ban')}</p>
          <p className="mt-1 truncate font-display text-base font-black text-green-700">
            {me ? `#${me.rank}` : "--"}
          </p>
        </div>
      </div>
    </section>
  );
}

function LoadingState() {
  return (
    <>
      <div className="flex h-72 items-end gap-2">
        {[2, 1, 3].map((rank) => (
          <div
            key={rank}
            className={`flex flex-1 flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-card ${
              rank === 1 ? "h-64" : "h-52"
            }`}
          >
            <Skeleton className="h-20 w-20 rounded-full" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="grid grid-cols-[2.25rem_2.75rem_minmax(0,1fr)_4.5rem] items-center gap-3 rounded-xl border border-border bg-surface p-3">
            <Skeleton className="h-6 w-6 rounded" />
            <Skeleton className="h-11 w-11 rounded-full" />
            <div className="flex min-w-0 flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-14 rounded-full" />
            </div>
            <Skeleton className="h-7 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </>
  );
}

export function LeaderboardPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({ queryKey: ["leaderboard"], queryFn: getLeaderboard });
  const entries = data?.entries ?? [];
  const me = data?.me;
  const meInTop = me != null && entries.some((entry) => entry.user_id === me.user_id);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <div className="flex flex-col gap-4 pb-4">
      <HeaderStats entries={entries} me={me} />
      {isLoading ? (
        <LoadingState />
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-primary-200 bg-surface-muted p-6 text-center">
          <Icon name="mountain" size={34} className="mx-auto text-primary" aria-hidden="true" />
          <p className="mt-3 font-bold text-foreground">{t('chua_co_ai_tren_bang')}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('checkin_dau_tien_se_mo')}
          </p>
        </div>
      ) : (
        <>
          {top3.length > 0 && (
            <section aria-label={t('top_3_nha_kham_pha')}>
              <div className="flex min-h-[14rem] items-end gap-2 mt-1">
                {top3.map((entry, index) => (
                  <PodiumCard
                    key={entry.user_id}
                    entry={entry}
                    style={PODIUM_STYLE[index]}
                    isMe={entry.user_id === me?.user_id}
                    onOpen={() => openProfile(entry, setProfileUsername)}
                  />
                ))}
              </div>
            </section>
          )}

          {rest.length > 0 && (
            <section className="flex flex-col gap-2" aria-label={t('top_nha_kham_pha')}>
              <div className="flex items-center gap-2">
                <Icon name="compass" size={22} className="text-primary" aria-hidden="true" />
                <h2 className="font-display text-lg font-black text-clay-800">
                  {t('top_nha_kham_pha')}
                </h2>
                <span className="h-px flex-1 border-t border-dashed border-primary-200" />
              </div>
              {rest.map((entry) => (
                <LeaderboardRow
                  key={entry.user_id}
                  entry={entry}
                  highlight={entry.user_id === me?.user_id}
                  onOpen={() => openProfile(entry, setProfileUsername)}
                />
              ))}
            </section>
          )}

          {me && !meInTop && (
            <section className="flex flex-col gap-2 pt-1" aria-label={t('hang_cua_ban')}>
              <div className="flex items-center justify-center gap-2 text-xs font-semibold text-muted-foreground">
                <span className="h-px w-10 border-t border-dashed border-primary-200" />
                {t('hang_cua_ban')}
                <span className="h-px w-10 border-t border-dashed border-primary-200" />
              </div>
              <LeaderboardRow
                entry={me}
                highlight
                onOpen={() => openProfile(me, setProfileUsername)}
              />
            </section>
          )}
        </>
      )}

      {profileUsername && (
        <UserProfileSheet username={profileUsername} onClose={() => setProfileUsername(null)} />
      )}
    </div>
  );
}

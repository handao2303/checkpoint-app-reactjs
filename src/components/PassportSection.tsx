import { useQuery } from "@tanstack/react-query";
import { Icon } from "./ui/Icon";
import { getPassport } from "../lib/api";
import { Skeleton } from "./ui/Skeleton";

/** Digital passport: one "stamp" per province the user has checked in to. */
export function PassportSection() {
  const { data, isLoading } = useQuery({ queryKey: ["passport"], queryFn: getPassport });
  const stamps = (data?.stamps ?? [])
    .sort((a, b) => b.checkin_count - a.checkin_count)
    .slice(0, 6);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-lg font-bold">
          <Icon name="passport" size={20} className="text-primary" /> Hộ chiếu
        </h3>
        {data && data.province_count > 0 && (
          <span className="text-sm text-muted-foreground">{data.province_count} tỉnh thành</span>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-border bg-surface">
              <Skeleton className="h-24 w-full rounded-none" />
              <div className="flex flex-col gap-1.5 p-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : stamps.length === 0 ? (
        <p className="rounded-xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
          Chưa có con dấu nào. Check-in ở một tỉnh thành để đóng dấu hộ chiếu!
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {stamps.map((s) => (
            <div
              key={s.province}
              className="overflow-hidden rounded-xl border border-border bg-surface shadow-card"
            >
              {s.cover_url ? (
                <img src={s.cover_url} alt="" className="h-24 w-full object-cover" />
              ) : (
                <div className="flex h-24 w-full items-center justify-center bg-primary-50 text-primary">
                  <Icon name="pin" size={24} />
                </div>
              )}
              <div className="p-2">
                <p className="truncate font-semibold text-foreground">{s.province}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Icon name="flag" size={12} /> {s.checkin_count} lần
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

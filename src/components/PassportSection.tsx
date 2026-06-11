import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { getPassport } from "../lib/api";

/** Digital passport: one "stamp" per province the user has checked in to. */
export function PassportSection() {
  const { data, isLoading } = useQuery({ queryKey: ["passport"], queryFn: getPassport });
  const stamps = data?.stamps ?? [];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-lg font-bold">🛂 Hộ chiếu</h3>
        {data && data.province_count > 0 && (
          <span className="text-sm text-muted-foreground">{data.province_count} tỉnh thành</span>
        )}
      </div>

      {isLoading ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Đang tải...</p>
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
                <div className="flex h-24 w-full items-center justify-center bg-[image:var(--gradient-passport)] text-white">
                  <MapPin size={24} />
                </div>
              )}
              <div className="p-2">
                <p className="truncate font-semibold text-foreground">{s.province}</p>
                <p className="text-xs text-muted-foreground">🚩 {s.checkin_count} lần</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

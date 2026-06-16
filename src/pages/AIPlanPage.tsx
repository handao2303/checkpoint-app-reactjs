import { useEffect } from "react";
import { Icon } from "../components/ui/Icon";
import { trackEvent } from "../lib/observability";
const teasers = [
  "Lên lịch trình từ data cộng đồng",
  "Gợi ý địa điểm hợp gu bạn",
  "Tự xếp ảnh theo hành trình",
];

export function AIPlanPage() {
  useEffect(() => {
    trackEvent("ai_plan_open");
  }, []);

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-green-700 text-white shadow-card">
        <Icon name="bot" size={40} />
      </span>
      <div>
        <h2 className="font-display text-2xl font-bold text-clay-600">Trợ lý AI</h2>
        <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
          <Icon name="sparkles" size={14} /> Sắp ra mắt
        </p>
      </div>
      <p className="max-w-xs text-sm text-muted-foreground">
        Tính năng lập kế hoạch chuyến đi bằng AI đang được phát triển. Sẽ có ở bản cập nhật tới!
      </p>
      <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
        {teasers.map((t) => (
          <li key={t} className="flex items-center gap-2">
            <Icon name="sparkles" size={14} className="text-green-600" /> {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

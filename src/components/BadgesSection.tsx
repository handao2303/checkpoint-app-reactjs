import { useQuery } from "@tanstack/react-query";
import { Card } from "./ui/Card";
import { getBadges } from "../lib/api";

/** Achievement badges: the full catalog with the user's unlock state. */
export function BadgesSection() {
  const { data: badges = [], isLoading } = useQuery({ queryKey: ["badges"], queryFn: getBadges });
  const unlocked = badges.filter((b) => b.awarded).length;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-lg font-bold">🏅 Huy hiệu</h3>
        {badges.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {unlocked}/{badges.length}
          </span>
        )}
      </div>

      {isLoading ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Đang tải...</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {badges.map((b) => (
            <Card
              key={b.key}
              className={`flex flex-col items-center gap-2 py-4 text-center ${
                b.awarded ? "" : "opacity-60"
              }`}
            >
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-full text-2xl ${
                  b.awarded ? "bg-primary-50" : "bg-surface-muted grayscale"
                }`}
              >
                {b.awarded ? b.icon : "🔒"}
              </span>
              <p className="text-sm font-medium">{b.name}</p>
              <p className="text-xs text-muted-foreground">{b.description}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

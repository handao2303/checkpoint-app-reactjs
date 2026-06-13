import { lazy, Suspense, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Route, Plus, Square, Flag } from "lucide-react";
import { getMyJourneys, createJourney, updateJourney, type Journey } from "../lib/api";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Sheet } from "./ui/Sheet";

// Lazy so MapLibre loads only when a journey is opened (not on Profile mount).
const JourneyDetailSheet = lazy(() =>
  import("./JourneyDetailSheet").then((m) => ({ default: m.JourneyDetailSheet })),
);

export function JourneysSection() {
  const qc = useQueryClient();
  const { data: journeys = [] } = useQuery({ queryKey: ["journeys", "me"], queryFn: getMyJourneys });
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // Multiple journeys can be active at once; a check-in picks which one to
  // record under. Newest-activated first.
  const activeJourneys = journeys
    .filter((j) => j.is_active)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  async function submitStart(e: FormEvent) {
    e.preventDefault();
    const name = title.trim();
    if (!name) return;
    setBusy(true);
    try {
      const j = await createJourney(name, description.trim() || undefined);
      await updateJourney(j.id, { is_active: true });
      await qc.invalidateQueries({ queryKey: ["journeys"] });
      setStarting(false);
      setTitle("");
      setDescription("");
    } finally {
      setBusy(false);
    }
  }

  async function end(j: Journey) {
    setBusy(true);
    try {
      await updateJourney(j.id, { is_active: false });
      await qc.invalidateQueries({ queryKey: ["journeys"] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-lg font-bold">Hành trình</h3>
        <button onClick={() => setStarting(true)} className="text-sm font-semibold text-primary">
          + Bắt đầu
        </button>
      </div>

      {activeJourneys.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          {activeJourneys.map((active) => (
            <div key={active.id} className="flex items-center gap-3 rounded-xl bg-green-50 p-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-green-700 text-white">
                <Route size={18} />
              </span>
              <div className="flex-1">
                <p className="text-xs text-green-700">Đang đi</p>
                <p className="font-semibold text-foreground">{active.title}</p>
              </div>
              <Button size="sm" variant="outline" icon={<Square size={14} />} disabled={busy} onClick={() => end(active)}>
                Kết thúc
              </Button>
            </div>
          ))}
        </div>
      )}

      {journeys.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
          <Plus size={24} />
          Chưa có hành trình. Bấm "Bắt đầu" rồi check-in để gom thành chuyến đi.
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {journeys.map((j) => (
            <button
              key={j.id}
              onClick={() => setOpenId(j.id)}
              className="flex items-center gap-3 rounded-xl bg-surface p-3 text-left shadow-card"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-50 text-primary">
                <Route size={20} />
              </span>
              <div className="flex-1">
                <p className="font-semibold text-foreground">{j.title}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(j.created_at).toLocaleDateString("vi-VN")}
                  {j.is_active && " · đang đi"}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {starting && (
        <Sheet title="Bắt đầu hành trình" onClose={() => setStarting(false)}>
          <form onSubmit={submitStart} className="flex flex-col gap-3">
            <input
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tên hành trình (vd: Đà Lạt 3 ngày)"
              className="rounded-full border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mô tả (tùy chọn)"
              className="resize-none rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <Button type="submit" disabled={busy} icon={<Flag size={20} />}>
              {busy ? "Đang tạo..." : "Bắt đầu"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Check-in sau khi bắt đầu sẽ tự gắn vào hành trình này.
            </p>
          </form>
        </Sheet>
      )}

      {openId && (
        <Suspense fallback={null}>
          <JourneyDetailSheet id={openId} onClose={() => setOpenId(null)} />
        </Suspense>
      )}
    </div>
  );
}

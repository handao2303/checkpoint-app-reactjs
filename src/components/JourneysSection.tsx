import { lazy, Suspense, useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "./ui/Icon";
import {
  assignCheckpointsToJourney,
  createJourney,
  getMyJourneys,
  getMyUnassignedCheckpoints,
  updateJourney,
  type Checkpoint,
  type Journey,
} from "../lib/api";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Sheet } from "./ui/Sheet";
import { categoryIcon } from "../lib/maps";
import { trackEvent } from "../lib/observability";

// Lazy so MapLibre loads only when a journey is opened (not on Profile mount).
const JourneyDetailSheet = lazy(() =>
  import("./JourneyDetailSheet").then((m) => ({ default: m.JourneyDetailSheet })),
);

type CheckpointJourneyDraft = {
  pickerOpen: boolean;
  createOpen: boolean;
  title: string;
  description: string;
  selected: Checkpoint[];
  draggingId: string | null;
  busy: boolean;
};

const emptyDraft: CheckpointJourneyDraft = {
  pickerOpen: false,
  createOpen: false,
  title: "",
  description: "",
  selected: [],
  draggingId: null,
  busy: false,
};

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

function formatDateSpan(checkpoints: Checkpoint[]): string | null {
  if (checkpoints.length === 0) return null;
  const timestamps = checkpoints.map((cp) => new Date(cp.created_at).getTime()).filter(Number.isFinite);
  if (timestamps.length === 0) return null;
  const start = new Date(Math.min(...timestamps)).toLocaleDateString("vi-VN");
  const end = new Date(Math.max(...timestamps)).toLocaleDateString("vi-VN");
  return start === end ? start : `${start} - ${end}`;
}

export function JourneysSection() {
  const qc = useQueryClient();
  const { data: journeys = [] } = useQuery({ queryKey: ["journeys", "me"], queryFn: getMyJourneys });
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [draft, setDraft] = useState<CheckpointJourneyDraft>(emptyDraft);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const selectedIds = new Set(draft.selected.map((cp) => cp.id));
  const selectedDateSpan = formatDateSpan(draft.selected);

  const picker = useInfiniteQuery({
    queryKey: ["checkpoints", "me", "unassigned"],
    queryFn: ({ pageParam }) => getMyUnassignedCheckpoints({ limit: 20, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor,
    enabled: draft.pickerOpen,
  });
  const pickerCheckpoints = picker.data?.pages.flatMap((page) => page.checkpoints) ?? [];

  useEffect(() => {
    if (!draft.pickerOpen || !picker.hasNextPage || picker.isFetchingNextPage) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) picker.fetchNextPage();
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [draft.pickerOpen, picker]);

  // Multiple journeys can be active at once; a check-in picks which one to
  // record under. Newest-activated first.
  const activeJourneys = journeys
    .filter((j) => j.is_active)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  function openCheckpointPicker() {
    trackEvent("journey_checkpoint_picker_open");
    setDraft((current) => ({ ...current, pickerOpen: true }));
  }

  function closePicker() {
    setDraft((current) =>
      current.createOpen ? { ...current, pickerOpen: false } : { ...emptyDraft },
    );
  }

  function continueFromPicker() {
    if (draft.selected.length === 0) return;
    setDraft((current) => ({ ...current, pickerOpen: false, createOpen: true }));
  }

  function toggleCheckpoint(cp: Checkpoint) {
    setDraft((current) => {
      const exists = current.selected.some((item) => item.id === cp.id);
      return {
        ...current,
        selected: exists
          ? current.selected.filter((item) => item.id !== cp.id)
          : [...current.selected, cp],
      };
    });
  }

  function removeSelected(id: string) {
    setDraft((current) => ({
      ...current,
      selected: current.selected.filter((item) => item.id !== id),
    }));
  }

  function moveSelected(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    setDraft((current) => {
      const sourceIndex = current.selected.findIndex((item) => item.id === sourceId);
      const targetIndex = current.selected.findIndex((item) => item.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const next = [...current.selected];
      const [item] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, item);
      return { ...current, selected: next };
    });
  }

  async function submitStart(e: FormEvent) {
    e.preventDefault();
    const name = title.trim();
    if (!name) return;
    setBusy(true);
    try {
      const j = await createJourney(name, description.trim() || undefined);
      await updateJourney(j.id, { is_active: true });
      trackEvent("journey_create_success", { journey_id: j.id });
      trackEvent("journey_start_success", { journey_id: j.id });
      await qc.invalidateQueries({ queryKey: ["journeys"] });
      setStarting(false);
      setTitle("");
      setDescription("");
    } catch {
      trackEvent("journey_create_failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitCheckpointJourney(e: FormEvent) {
    e.preventDefault();
    const name = draft.title.trim();
    if (!name || draft.selected.length === 0) return;
    setDraft((current) => ({ ...current, busy: true }));
    try {
      const j = await createJourney(name, draft.description.trim() || undefined);
      await assignCheckpointsToJourney(j.id, draft.selected.map((cp) => cp.id));
      trackEvent("journey_create_from_checkpoints_success", {
        journey_id: j.id,
        checkpoint_count: draft.selected.length,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["journeys"] }),
        qc.invalidateQueries({ queryKey: ["journey"] }),
        qc.invalidateQueries({ queryKey: ["checkpoints"] }),
      ]);
      setDraft(emptyDraft);
    } catch {
      trackEvent("journey_create_from_checkpoints_failed");
      setDraft((current) => ({ ...current, busy: false }));
    }
  }

  async function end(j: Journey) {
    setBusy(true);
    try {
      await updateJourney(j.id, { is_active: false });
      trackEvent("journey_end_success", { journey_id: j.id });
      await qc.invalidateQueries({ queryKey: ["journeys"] });
    } catch {
      trackEvent("journey_end_failed", { journey_id: j.id });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="font-display text-lg font-bold">Hành trình</h3>
        <div className="flex items-center gap-3">
          <button
            onClick={openCheckpointPicker}
            className="text-sm font-semibold text-primary"
          >
            + Từ check-in
          </button>
          <button
            onClick={() => {
              trackEvent("journey_start_open");
              setStarting(true);
            }}
            className="text-sm font-semibold text-primary"
          >
            + Bắt đầu
          </button>
        </div>
      </div>

      {activeJourneys.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          {activeJourneys.map((active) => (
            <div key={active.id} className="flex items-center gap-3 rounded-xl bg-green-50 p-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-green-700 text-white">
                <Icon name="route" size={18} />
              </span>
              <div className="flex-1">
                <p className="text-xs text-green-700">Đang đi</p>
                <p className="font-semibold text-foreground">{active.title}</p>
              </div>
              <Button size="sm" variant="outline" icon={<Icon name="square" size={14} />} disabled={busy} onClick={() => end(active)}>
                Kết thúc
              </Button>
            </div>
          ))}
        </div>
      )}

      {journeys.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
          <Icon name="plus" size={24} />
          Chưa có hành trình. Bấm "Bắt đầu" rồi check-in để gom thành chuyến đi.
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {journeys.map((j) => (
            <button
              key={j.id}
              onClick={() => {
                trackEvent("journey_detail_open", { journey_id: j.id });
                setOpenId(j.id);
              }}
              className="flex items-center gap-3 rounded-xl bg-surface p-3 text-left shadow-card"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-50 text-primary">
                <Icon name="route" size={20} />
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

      {draft.pickerOpen && (
        <CheckpointPickerModal
          checkpoints={pickerCheckpoints}
          selectedIds={selectedIds}
          selectedCount={draft.selected.length}
          isLoading={picker.isLoading}
          isFetchingNextPage={picker.isFetchingNextPage}
          hasNextPage={!!picker.hasNextPage}
          sentinelRef={sentinelRef}
          onToggle={toggleCheckpoint}
          onClose={closePicker}
          onContinue={continueFromPicker}
        />
      )}

      {draft.createOpen && (
        <Sheet title="Tạo hành trình" onClose={() => setDraft(emptyDraft)}>
          <form onSubmit={submitCheckpointJourney} className="flex flex-col gap-3">
            <input
              required
              autoFocus
              value={draft.title}
              onChange={(e) => setDraft((current) => ({ ...current, title: e.target.value }))}
              placeholder="Tên hành trình"
              className="rounded-full border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <textarea
              rows={2}
              value={draft.description}
              onChange={(e) => setDraft((current) => ({ ...current, description: e.target.value }))}
              placeholder="Mô tả (tùy chọn)"
              className="resize-none rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />

            {selectedDateSpan && (
              <div className="flex items-center gap-2 rounded-xl bg-surface-muted px-3 py-2 text-sm text-muted-foreground">
                <Icon name="route" size={16} />
                <span>
                  Thời gian hành trình: <span className="font-semibold text-foreground">{selectedDateSpan}</span>
                </span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Check-in đã chọn</p>
              <button type="button" onClick={openCheckpointPicker} className="text-sm font-semibold text-primary">
                + Chọn thêm
              </button>
            </div>

            <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
              {draft.selected.map((cp) => (
                <SelectedCheckpointRow
                  key={cp.id}
                  checkpoint={cp}
                  dragging={draft.draggingId === cp.id}
                  onRemove={() => removeSelected(cp.id)}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", cp.id);
                    setDraft((current) => ({ ...current, draggingId: cp.id }));
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    const sourceId = event.dataTransfer.getData("text/plain") || draft.draggingId;
                    if (sourceId) moveSelected(sourceId, cp.id);
                  }}
                  onDragEnd={() => setDraft((current) => ({ ...current, draggingId: null }))}
                />
              ))}
            </div>

            <Button
              type="submit"
              disabled={draft.busy || draft.selected.length === 0 || draft.title.trim() === ""}
              icon={<Icon name="route" size={20} />}
            >
              {draft.busy ? "Đang tạo..." : "Tạo hành trình"}
            </Button>
          </form>
        </Sheet>
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
            <Button type="submit" disabled={busy} icon={<Icon name="flag" size={20} />}>
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

function CheckpointPickerModal({
  checkpoints,
  selectedIds,
  selectedCount,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  sentinelRef,
  onToggle,
  onClose,
  onContinue,
}: {
  checkpoints: Checkpoint[];
  selectedIds: Set<string>;
  selectedCount: number;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  onToggle: (checkpoint: Checkpoint) => void;
  onClose: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 flex max-h-[82dvh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-surface shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border p-4">
          <h2 className="font-display text-lg font-bold">Chọn check-in</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-muted"
          >
            <Icon name="x" size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2">
          {isLoading ? (
            <div className="flex flex-col gap-2 py-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-muted" />
              ))}
            </div>
          ) : checkpoints.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Không có check-in nào chưa thuộc hành trình.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {checkpoints.map((cp) => (
                <button
                  key={cp.id}
                  type="button"
                  onClick={() => onToggle(cp)}
                  className="flex items-center gap-3 py-3 text-left"
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                      selectedIds.has(cp.id)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-surface"
                    }`}
                  >
                    {selectedIds.has(cp.id) && <Icon name="check" size={14} />}
                  </span>
                  <CheckpointThumb checkpoint={cp} size="lg" />
                  <CheckpointText checkpoint={cp} />
                </button>
              ))}
              <div ref={sentinelRef} className="h-8" />
              {isFetchingNextPage && (
                <p className="py-2 text-center text-xs text-muted-foreground">Đang tải thêm...</p>
              )}
              {!hasNextPage && checkpoints.length > 0 && (
                <p className="py-2 text-center text-xs text-muted-foreground">Đã hết danh sách.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-border p-4">
          <span className="text-sm font-semibold text-muted-foreground">Đã chọn {selectedCount}</span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Huỷ
            </Button>
            <Button type="button" size="sm" disabled={selectedCount === 0} onClick={onContinue}>
              Tiếp tục
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SelectedCheckpointRow({
  checkpoint,
  dragging,
  onRemove,
  onDragStart,
  onDragOver,
  onDragEnd,
}: {
  checkpoint: Checkpoint;
  dragging: boolean;
  onRemove: () => void;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-2 rounded-xl bg-surface-muted p-2 transition ${
        dragging ? "opacity-60" : ""
      }`}
    >
      <span className="cursor-grab text-muted-foreground active:cursor-grabbing">
        <Icon name="more-vertical" size={18} />
      </span>
      <CheckpointThumb checkpoint={checkpoint} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{checkpoint.name}</p>
        <p className="text-xs text-muted-foreground">{formatDate(checkpoint.created_at)}</p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Bỏ ${checkpoint.name}`}
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-surface hover:text-foreground"
      >
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

function CheckpointThumb({ checkpoint, size }: { checkpoint: Checkpoint; size: "sm" | "lg" }) {
  const box = size === "lg" ? "h-16 w-16 rounded-xl" : "h-10 w-10 rounded-lg";
  const iconSize = size === "lg" ? 24 : 18;
  if (checkpoint.thumbnail_url || checkpoint.image_url) {
    return (
      <span className={`relative shrink-0 overflow-hidden ${box}`}>
        <img
          src={checkpoint.thumbnail_url ?? checkpoint.image_url}
          alt=""
          className="h-full w-full object-cover"
        />
        {checkpoint.media_type === "video" && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-white">
            <Icon name="play" size={iconSize} className="ml-0.5 fill-white" />
          </span>
        )}
      </span>
    );
  }
  return (
    <span className={`flex shrink-0 items-center justify-center bg-surface-muted text-muted-foreground ${box}`}>
      <Icon name={categoryIcon(checkpoint.category)} size={iconSize} />
    </span>
  );
}

function CheckpointText({ checkpoint }: { checkpoint: Checkpoint }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate font-semibold text-foreground">{checkpoint.name}</span>
      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
        {checkpoint.address || checkpoint.category}
      </span>
      <span className="mt-0.5 block text-xs text-muted-foreground">
        {formatDate(checkpoint.created_at)} · +{checkpoint.xp_awarded} XP
      </span>
    </span>
  );
}

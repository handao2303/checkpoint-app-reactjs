import { t } from "../lib/i18n";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { useDeleteCheckpoint } from "../hooks/useDeleteCheckpoint";
import {
  getMyCheckpointPage,
  updateCheckpoint,
  type Checkpoint,
} from "../lib/api";
import { categoryIcon } from "../lib/maps";
import { trackError, trackEvent } from "../lib/observability";
import { CheckpointDetailSheet } from "./CheckpointDetailSheet";
import { Button } from "./ui/Button";
import { ImagePlaceholder } from "./ui/Card";
import { Icon } from "./ui/Icon";
import { Sheet } from "./ui/Sheet";
import { Skeleton } from "./ui/Skeleton";

type EditState = {
  checkpoint: Checkpoint;
  name: string;
  note: string;
  rating: string;
  busy: boolean;
  error: string | null;
};

export function MyCheckpointsSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);

  const checkpointsQuery = useInfiniteQuery({
    queryKey: ["checkpoints", "me", "page"],
    queryFn: ({ pageParam }) => getMyCheckpointPage({ limit: 15, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor,
  });

  const checkpoints = checkpointsQuery.data?.pages.flatMap((page) => page.checkpoints) ?? [];
  const rowCount = checkpoints.length + (checkpointsQuery.hasNextPage ? 1 : 0);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 132,
    overscan: 5,
    getItemKey: (index) => checkpoints[index]?.id ?? `loader-${index}`,
  });
  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    const last = virtualItems.at(-1);
    if (
      last &&
      last.index >= checkpoints.length - 1 &&
      checkpointsQuery.hasNextPage &&
      !checkpointsQuery.isFetchingNextPage
    ) {
      trackEvent("my_checkpoints_next_page");
      void checkpointsQuery.fetchNextPage();
    }
  }, [checkpoints.length, checkpointsQuery, virtualItems]);

  function openEdit(checkpoint: Checkpoint) {
    trackEvent("checkpoint_edit_open", { checkpoint_id: checkpoint.id });
    setEditing({
      checkpoint,
      name: checkpoint.name,
      note: checkpoint.note ?? "",
      rating: checkpoint.rating == null ? "" : String(checkpoint.rating),
      busy: false,
      error: null,
    });
  }

  async function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return;
    const rating = editing.rating === "" ? null : Number(editing.rating);
    if (rating != null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
      setEditing((current) =>
        current ? { ...current, error: t('diem_danh_gia_phai_tu') } : current,
      );
      return;
    }
    setEditing((current) => (current ? { ...current, busy: true, error: null } : current));
    try {
      await updateCheckpoint(editing.checkpoint.id, {
        name,
        note: editing.note.trim() || null,
        rating,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["checkpoints"] }),
        queryClient.invalidateQueries({ queryKey: ["checkpoint", editing.checkpoint.id] }),
        queryClient.invalidateQueries({ queryKey: ["feed"] }),
        queryClient.invalidateQueries({ queryKey: ["journey"] }),
        queryClient.invalidateQueries({ queryKey: ["journeys"] }),
      ]);
      trackEvent("checkpoint_edit_success", { checkpoint_id: editing.checkpoint.id });
      setEditing(null);
    } catch (error) {
      trackError(error, { feature: "checkpoint", action: "checkpoint_edit", checkpoint_id: editing.checkpoint.id });
      trackEvent("checkpoint_edit_failed", { checkpoint_id: editing.checkpoint.id });
      setEditing((current) =>
        current ? { ...current, busy: false, error: t('khong_luu_duoc_checkin_vui') } : current,
      );
    }
  }

  return (
    <>
      <Sheet title={t('checkin_cua_toi')} onClose={onClose} grow className="h-[90dvh]">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
          {checkpointsQuery.isLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <CheckpointRowSkeleton key={index} />
              ))}
            </div>
          ) : checkpoints.length === 0 ? (
            <p className="rounded-xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
              {t('chua_co_checkin_nao')}
            </p>
          ) : (
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualItems.map((item) => {
                const checkpoint = checkpoints[item.index];
                return (
                  <div
                    key={item.key}
                    data-index={item.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${item.start}px)`,
                    }}
                  >
                    <div className="pb-3">
                      {checkpoint ? (
                        <CheckpointManageRow
                          checkpoint={checkpoint}
                          onOpen={() => {
                            trackEvent("my_checkpoint_detail_open", { checkpoint_id: checkpoint.id });
                            setSelectedId(checkpoint.id);
                          }}
                          onEdit={() => openEdit(checkpoint)}
                          onDeleted={() => {
                            if (selectedId === checkpoint.id) setSelectedId(null);
                          }}
                        />
                      ) : (
                        <CheckpointRowSkeleton />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Sheet>

      {selectedId && <CheckpointDetailSheet id={selectedId} onClose={() => setSelectedId(null)} />}

      {editing && (
        <Sheet title={t('sua_checkin')} onClose={() => setEditing(null)}>
          <form onSubmit={submitEdit} className="flex flex-col gap-3">
            <input
              required
              autoFocus
              value={editing.name}
              onChange={(event) =>
                setEditing((current) => (current ? { ...current, name: event.target.value } : current))
              }
              placeholder={t('ten_dia_diem')}
              className="rounded-full border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <textarea
              rows={3}
              value={editing.note}
              onChange={(event) =>
                setEditing((current) => (current ? { ...current, note: event.target.value } : current))
              }
              placeholder={t('ghi_chu_tuy_chon')}
              className="resize-none rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex items-center gap-1 rounded-2xl border border-border bg-surface p-3">
              {[1, 2, 3, 4, 5].map((value) => {
                const currentRating = editing.rating === "" ? undefined : Number(editing.rating);
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      setEditing((current) =>
                        current
                          ? { ...current, rating: current.rating === String(value) ? "" : String(value) }
                          : current,
                      )
                    }
                    className={`rounded-full p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      currentRating && value <= currentRating ? "opacity-100" : "opacity-30"
                    }`}
                    aria-label={`${value} sao`}
                  >
                    <Icon name="star" size={30} className="fill-gold text-gold" />
                  </button>
                );
              })}
            </div>
            {editing.error && <p className="text-sm font-medium text-accent-700">{editing.error}</p>}
            <Button
              type="submit"
              disabled={editing.busy || editing.name.trim() === ""}
              icon={<Icon name="pencil" size={18} />}
            >
              {editing.busy ? t('dang_luu') : t('luu_thay_doi')}
            </Button>
          </form>
        </Sheet>
      )}
    </>
  );
}

function CheckpointManageRow({
  checkpoint,
  onOpen,
  onEdit,
  onDeleted,
}: {
  checkpoint: Checkpoint;
  onOpen: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const { requestDelete, confirming, confirmBox } = useDeleteCheckpoint(checkpoint.id, { onDeleted });

  function positionMenu() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const gap = 4;
    const viewportPadding = 8;
    const menuHeight = dropdownRef.current?.offsetHeight ?? 96;
    const top = rect.bottom + gap + menuHeight > window.innerHeight - viewportPadding
      ? Math.max(viewportPadding, rect.top - menuHeight - gap)
      : rect.bottom + gap;
    setMenuPosition({
      top,
      right: Math.max(viewportPadding, window.innerWidth - rect.right),
    });
  }

  useEffect(() => {
    if (!menuOpen) return;
    positionMenu();

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    window.addEventListener("resize", positionMenu);
    document.addEventListener("scroll", positionMenu, true);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("resize", positionMenu);
      document.removeEventListener("scroll", positionMenu, true);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <div className="relative rounded-2xl border border-border/80 bg-surface px-3 py-2.5 pr-10 shadow-sm">
      <div className="flex items-stretch gap-2.5">
        <CheckpointThumb checkpoint={checkpoint} />
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 flex-col items-start justify-around text-left">
          <div className="flex w-full items-center gap-1">
            <Icon name={categoryIcon(checkpoint.category)} size={15} className="shrink-0 text-muted-foreground" />
            <p className="min-w-0 flex-1 truncate font-semibold leading-tight text-foreground">{checkpoint.name}</p>
          </div>
          <p className="text-xs text-subtle-foreground">
            {new Date(checkpoint.created_at).toLocaleDateString("vi-VN")}
          </p>
          {checkpoint.note && <p className="line-clamp-1 text-sm text-foreground">{checkpoint.note}</p>}
          <div className="flex w-full min-w-0 items-center gap-2 text-xs text-muted-foreground">
            {checkpoint.rating != null && (
              <span className="flex shrink-0 items-center gap-1">
                <Icon name="star" size={14} className="fill-gold text-gold" /> {checkpoint.rating}/5
              </span>
            )}
            {checkpoint.address && (
              <span className="flex min-w-0 items-center gap-1">
                <Icon name="map-pin" size={13} className="shrink-0" />
                <span className="truncate">{checkpoint.address}</span>
              </span>
            )}
          </div>
        </button>
        <div ref={menuRef} className="absolute right-2 top-2 z-30">
          <button
            ref={buttonRef}
            type="button"
            onClick={() => {
              if (!menuOpen) positionMenu();
              setMenuOpen((open) => !open);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-muted"
            aria-label={t('tuy_chon_checkin')}
            aria-expanded={menuOpen}
          >
            <Icon name="more-vertical" size={18} />
          </button>
          {menuOpen && menuPosition && createPortal(
            <div
              ref={dropdownRef}
              className="fixed z-[9999] min-w-40 overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
              style={{ top: menuPosition.top, right: menuPosition.right }}
            >
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onEdit();
                }}
                className="flex w-full items-center gap-2 px-4 py-3 text-sm text-foreground hover:bg-surface-muted"
              >
                <Icon name="pencil" size={16} /> {t('sua')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  requestDelete();
                }}
                className="flex w-full items-center gap-2 px-4 py-3 text-sm text-accent-600 hover:bg-accent-50"
              >
                <Icon name="trash" size={16} /> {t('xoa')}
              </button>
            </div>,
            document.body,
          )}
        </div>
      </div>
      {confirming && <div className="mt-3">{confirmBox}</div>}
    </div>
  );
}

function CheckpointThumb({ checkpoint }: { checkpoint: Checkpoint }) {
  const src = checkpoint.thumbnail_url ?? checkpoint.image_url;
  if (src) {
    return (
      <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl bg-surface-muted">
        <img src={src} alt={checkpoint.name} className="h-full w-full object-cover" loading="lazy" />
        {checkpoint.media_type === "video" && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55">
              <Icon name="play" size={16} className="ml-0.5 fill-white" />
            </span>
          </span>
        )}
      </div>
    );
  }
  return (
    <ImagePlaceholder
      className="h-[72px] w-[72px] shrink-0 rounded-xl"
      label={<Icon name={categoryIcon(checkpoint.category)} size={22} />}
    />
  );
}

function CheckpointRowSkeleton() {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-border/80 bg-surface px-3 py-2.5 shadow-sm">
      <Skeleton className="h-[72px] w-[72px] shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="mt-1.5 h-3 w-20" />
        <Skeleton className="mt-2 h-3 w-full" />
        <Skeleton className="mt-2 h-5 w-24 rounded-full" />
      </div>
      <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
    </div>
  );
}

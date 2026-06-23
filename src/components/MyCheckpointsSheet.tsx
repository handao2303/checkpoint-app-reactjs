import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { useDeleteCheckpoint } from "../hooks/useDeleteCheckpoint";
import {
  getCheckpointDetail,
  getMyCheckpointPage,
  getUploadSlots,
  putFilesToSlots,
  updateCheckpoint,
  type Checkpoint,
  type CheckpointImage,
  type UpdateCheckpointMediaInput,
} from "../lib/api";
import { prepareCheckpointImage } from "../lib/image";
import { categoryIcon } from "../lib/maps";
import { trackError, trackEvent } from "../lib/observability";
import { prepareCheckpointVideo } from "../lib/video";
import {
  CheckpointFormFields,
  CHECKPOINT_MAX_IMAGES,
  CHECKPOINT_MAX_VIDEOS,
  isProbablyVideoFile,
  isNewFormMedia,
  revokeMedia,
  type FormMedia,
  type ExistingFormMedia,
  type NewFormMedia,
} from "./CheckpointFormFields";
import { CheckpointDetailSheet } from "./CheckpointDetailSheet";
import { ImagePlaceholder } from "./ui/Card";
import { Icon } from "./ui/Icon";
import { Sheet } from "./ui/Sheet";
import { Skeleton } from "./ui/Skeleton";

const MAX_EDIT_IMAGES = CHECKPOINT_MAX_IMAGES;
const MAX_EDIT_VIDEOS = CHECKPOINT_MAX_VIDEOS;

type EditState = {
  checkpoint: Checkpoint;
  name: string;
  note: string;
  rating: string;
  media: FormMedia[];
  mediaLoading: boolean;
  mediaProcessing: boolean;
  busy: boolean;
  error: string | null;
};

function existingMediaFromDetail(image: CheckpointImage): ExistingFormMedia {
  return {
    kind: "existing",
    id: image.id,
    type: image.type,
    url: image.url,
    thumbnailUrl: image.thumbnail_url,
  };
}

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

  async function openEdit(checkpoint: Checkpoint) {
    trackEvent("checkpoint_edit_open", { checkpoint_id: checkpoint.id });
    setEditing((current) => {
      if (current) revokeMedia(current.media);
      return {
        checkpoint,
        name: checkpoint.name,
        note: checkpoint.note ?? "",
        rating: checkpoint.rating == null ? "" : String(checkpoint.rating),
        media: [],
        mediaLoading: true,
        mediaProcessing: false,
        busy: false,
        error: null,
      };
    });
    try {
      const detail = await getCheckpointDetail(checkpoint.id);
      setEditing((current) =>
        current?.checkpoint.id === checkpoint.id
          ? { ...current, media: detail.images.map(existingMediaFromDetail), mediaLoading: false }
          : current,
      );
    } catch (error) {
      trackError(error, { feature: "checkpoint", action: "checkpoint_edit_load_media", checkpoint_id: checkpoint.id });
      setEditing((current) =>
        current?.checkpoint.id === checkpoint.id
          ? { ...current, mediaLoading: false, error: t('khong_luu_duoc_checkin_vui') }
          : current,
      );
    }
  }

  function closeEdit() {
    if (editing) revokeMedia(editing.media);
    setEditing(null);
  }

  async function addEditFiles(files: File[]) {
    if (!editing || files.length === 0) return;
    const hasVideo = files.some(isProbablyVideoFile);
    const hasImage = files.some((file) => !isProbablyVideoFile(file));
    setEditing((current) => (current ? { ...current, mediaProcessing: true, error: null } : current));
    try {
      let nextImageCount = editing.media.filter((item) => item.type === "image").length;
      let nextVideoCount = editing.media.filter((item) => item.type === "video").length;
      const prepared: NewFormMedia[] = [];
      for (const file of files) {
        if (isProbablyVideoFile(file)) {
          if (nextVideoCount >= MAX_EDIT_VIDEOS) {
            setEditing((current) => (current ? { ...current, error: t('toi_da_1_videocheckin') } : current));
            continue;
          }
          const { original, thumbnail } = await prepareCheckpointVideo(file);
          prepared.push({
            kind: "new",
            type: "video",
            original,
            thumbnail,
            url: URL.createObjectURL(original),
            thumbnailUrl: URL.createObjectURL(thumbnail),
          });
          nextVideoCount += 1;
          continue;
        }

        if (nextImageCount >= MAX_EDIT_IMAGES) {
          setEditing((current) =>
            current ? { ...current, error: t('toi_da_anh_checkin', { maxImages: MAX_EDIT_IMAGES }) } : current,
          );
          continue;
        }
        const { original, thumbnail } = await prepareCheckpointImage(file);
        prepared.push({
          kind: "new",
          type: "image",
          original,
          thumbnail,
          url: URL.createObjectURL(original),
          thumbnailUrl: URL.createObjectURL(thumbnail),
        });
        nextImageCount += 1;
      }
      if (prepared.length > 0) {
        setEditing((current) => (current ? { ...current, media: [...current.media, ...prepared] } : current));
      }
      trackEvent("checkpoint_edit_media_prepare_success", {
        checkpoint_id: editing.checkpoint.id,
        media_count: prepared.length,
        has_image: hasImage,
        has_video: hasVideo,
      });
    } catch (error) {
      trackError(error, { feature: "checkpoint", action: "checkpoint_edit_media_prepare", checkpoint_id: editing.checkpoint.id });
      setEditing((current) =>
        current
          ? { ...current, error: error instanceof Error ? error.message : t('khong_xu_ly_duoc_media') }
          : current,
      );
    } finally {
      setEditing((current) => (current ? { ...current, mediaProcessing: false } : current));
    }
  }

  function removeEditMedia(index: number) {
    setEditing((current) => {
      if (!current) return current;
      const removed = current.media[index];
      if (removed && isNewFormMedia(removed)) {
        URL.revokeObjectURL(removed.url);
        URL.revokeObjectURL(removed.thumbnailUrl);
      }
      return { ...current, media: current.media.filter((_, i) => i !== index), error: null };
    });
  }

  async function buildMediaPayload(media: FormMedia[]): Promise<UpdateCheckpointMediaInput[]> {
    const newMedia = media.filter(isNewFormMedia);
    let slots: Awaited<ReturnType<typeof getUploadSlots>> = [];
    if (newMedia.length > 0) {
      try {
        slots = await getUploadSlots(newMedia.map((item) => item.type));
      } catch {
        throw new Error(t('khong_lay_duoc_link_upload'));
      }
      try {
        await putFilesToSlots(
          slots,
          newMedia.map((item) => ({ original: item.original, thumbnail: item.thumbnail, type: item.type })),
        );
      } catch {
        throw new Error(t('upload_anhvideo_that_bai_vui'));
      }
    }

    let newIndex = 0;
    return media.map((item) => {
      if (item.kind === "existing") {
        return { id: item.id, type: item.type };
      }
      const slot = slots[newIndex++];
      return item.type === "video"
        ? { object_key: slot.object_key, type: item.type }
        : { object_key: slot.object_key, thumbnail_key: slot.thumbnail_key, type: item.type };
    });
  }

  async function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return;
    if (editing.mediaLoading || editing.mediaProcessing) return;
    if (editing.media.length === 0) {
      setEditing((current) => (current ? { ...current, error: t('bat_buoc_phai_co_it') } : current));
      return;
    }
    const rating = editing.rating === "" ? null : Number(editing.rating);
    if (rating != null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
      setEditing((current) =>
        current ? { ...current, error: t('diem_danh_gia_phai_tu') } : current,
      );
      return;
    }
    setEditing((current) => (current ? { ...current, busy: true, error: null } : current));
    try {
      const images = await buildMediaPayload(editing.media);
      await updateCheckpoint(editing.checkpoint.id, {
        name,
        note: editing.note.trim() || null,
        rating,
        images,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["checkpoints"] }),
        queryClient.invalidateQueries({ queryKey: ["checkpoint", editing.checkpoint.id] }),
        queryClient.invalidateQueries({ queryKey: ["feed"] }),
        queryClient.invalidateQueries({ queryKey: ["journey"] }),
        queryClient.invalidateQueries({ queryKey: ["journeys"] }),
      ]);
      trackEvent("checkpoint_edit_success", { checkpoint_id: editing.checkpoint.id });
      closeEdit();
    } catch (error) {
      trackError(error, { feature: "checkpoint", action: "checkpoint_edit", checkpoint_id: editing.checkpoint.id });
      trackEvent("checkpoint_edit_failed", { checkpoint_id: editing.checkpoint.id });
      setEditing((current) =>
        current
          ? { ...current, busy: false, error: error instanceof Error ? error.message : t('khong_luu_duoc_checkin_vui') }
          : current,
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
        <Sheet title={t('sua_checkin')} onClose={closeEdit}>
          <CheckpointFormFields
            mode="edit"
          {...editing}
            onNameChange={(value) =>
              setEditing((current) => (current ? { ...current, name: value } : current))
            }
            onNoteChange={(value) =>
              setEditing((current) => (current ? { ...current, note: value } : current))
            }
            onRatingChange={(value) =>
              setEditing((current) =>
                current ? { ...current, rating: value as string } : current,
              )
            }
            onAddFiles={(files) => void addEditFiles(files)}
            onRemoveMedia={(index) => removeEditMedia(index)}
            onSubmit={submitEdit}
            submitLabel={t('luu_thay_doi')}
            submitIcon={<Icon name="pencil" size={18} />}
          />
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
  const { t } = useTranslation();
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

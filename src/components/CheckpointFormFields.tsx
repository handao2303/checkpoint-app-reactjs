import { useRef, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";
import { MediaPreview } from "./MediaPreview";
import { Button } from "./ui/Button";
import { Icon } from "./ui/Icon";
import { Skeleton } from "./ui/Skeleton";

// ---- Shared media types ----

export type UploadMediaType = "image" | "video";

export interface ExistingFormMedia {
  kind: "existing";
  id: string;
  type: UploadMediaType;
  url: string;
  thumbnailUrl?: string;
}

export interface NewFormMedia {
  kind: "new";
  type: UploadMediaType;
  original: File;
  thumbnail: File;
  url: string;
  thumbnailUrl: string;
}

export type FormMedia = ExistingFormMedia | NewFormMedia;

// ---- Shared helpers ----

export function isProbablyVideoFile(file: File): boolean {
  return file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv|avi|3gp|3gpp)$/i.test(file.name);
}

export function isNewFormMedia(media: FormMedia): media is NewFormMedia {
  return media.kind === "new";
}

export function revokeMedia(media: FormMedia[]) {
  media.forEach((item) => {
    if (isNewFormMedia(item)) {
      URL.revokeObjectURL(item.url);
      URL.revokeObjectURL(item.thumbnailUrl);
    }
  });
}

export function countImages(media: FormMedia[]): number {
  return media.filter((m) => m.type === "image").length;
}

export function countVideos(media: FormMedia[]): number {
  return media.filter((m) => m.type === "video").length;
}

// ---- Shared component ----

export const CHECKPOINT_MAX_IMAGES = 3;
export const CHECKPOINT_MAX_VIDEOS = 1;

interface CheckpointFormFieldsProps {
  mode: "create" | "edit";
  name: string;
  note: string;
  /** Create mode: `number | undefined`. Edit mode: `string` (empty = none). */
  rating: string | number | undefined;
  media: FormMedia[];
  mediaLoading?: boolean;
  mediaProcessing?: boolean;
  error: string | null;
  busy: boolean;
  maxImages?: number;
  onNameChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onRatingChange: (value: unknown) => void;
  onAddFiles: (files: File[]) => void;
  onRemoveMedia: (index: number) => void;
  onSubmit: (e: FormEvent) => void;
  submitLabel: string;
  submitIcon?: ReactNode;
  submitDisabled?: boolean;
  /** Override the add-media button click (e.g., to open camera). Default opens file picker. */
  onAddMediaClick?: () => void;
  /** Add button icon override (e.g., camera icon for PWA). Default is image icon. */
  addButtonIcon?: ReactNode;
  /** Extra content rendered inside the name card (create mode only), below the name input
   *  (e.g., category picker chips). */
  nameCardExtra?: ReactNode;
  /** Extra content rendered after the submit button (e.g., CameraCaptureSheet portal). */
  children?: ReactNode;
}

export function CheckpointFormFields({
  mode,
  name,
  note,
  rating,
  media,
  mediaLoading = false,
  mediaProcessing = false,
  error,
  busy,
  maxImages = CHECKPOINT_MAX_IMAGES,
  onNameChange,
  onNoteChange,
  onRatingChange,
  onAddFiles,
  onRemoveMedia,
  onSubmit,
  submitLabel,
  submitIcon,
  submitDisabled,
  onAddMediaClick,
  addButtonIcon,
  nameCardExtra,
  children,
}: CheckpointFormFieldsProps) {
  const { t } = useTranslation();
  const imageFileRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);
  const imageCount = countImages(media);

  const currentRating: number | undefined =
    rating === "" || rating === undefined ? undefined : Number(rating);

  function handleStarClick(n: number) {
    if (mode === "create") {
      onRatingChange(n === rating ? undefined : n);
    } else {
      onRatingChange(rating === String(n) ? "" : String(n));
    }
  }

  function handleAddClick() {
    if (onAddMediaClick) {
      onAddMediaClick();
    } else {
      imageFileRef.current?.click();
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {/* ── Name ── */}
      {mode === "create" ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 shadow-card">
          <span className="flex items-center gap-2 font-display text-lg font-extrabold text-foreground">
            <Icon name="pin" size={20} className="text-primary" /> {t("dia_diem")}
          </span>
          <input
            required
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={t("ten_dia_diem")}
            className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          {nameCardExtra}
        </div>
      ) : (
        <input
          required
          autoFocus
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={t("ten_dia_diem")}
          className="rounded-full border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      )}

      {/* ── Note ── */}
      {mode === "create" ? (
        <label className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 shadow-card">
          <span className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-display text-lg font-extrabold text-foreground">
              <Icon name="pencil" size={20} className="text-primary" /> {t("cam_nhan_cua_ban")}
            </span>
            <span className="text-xs text-muted-foreground">{note.length}/500</span>
          </span>
          <textarea
            rows={4}
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder={t("goi_y_cam_nhan_checkpoint")}
            className="resize-none rounded-2xl border border-border bg-surface-muted p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
      ) : (
        <textarea
          rows={3}
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder={t("ghi_chu_tuy_chon")}
          className="resize-none rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      )}

      {/* ── Rating ── */}
      {mode === "create" ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
          <span className="flex items-center gap-2 font-display text-lg font-extrabold text-foreground">
            <Icon name="star" size={20} className="fill-gold text-gold" /> {t("danh_gia_dia_diem")}
          </span>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => handleStarClick(n)}
                className={cn(
                  "rounded-full p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  currentRating && n <= currentRating ? "opacity-100" : "opacity-30",
                )}
                aria-label={`${n} sao`}
              >
                <Icon name="star" size={30} className="fill-gold text-gold" />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1 rounded-2xl border border-border bg-surface p-3">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => handleStarClick(value)}
              className={cn(
                "rounded-full p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                currentRating && value <= currentRating ? "opacity-100" : "opacity-30",
              )}
              aria-label={`${value} sao`}
            >
              <Icon name="star" size={30} className="fill-gold text-gold" />
            </button>
          ))}
        </div>
      )}

      {/* ── Media ── */}
      {mode === "create" ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
          <span className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-display text-lg font-extrabold text-foreground">
              <Icon name="camera" size={20} className="text-primary" /> {t("them_anh")}
            </span>
            <span className="text-xs font-semibold text-primary">
              {t("anh_count_tren_max", { count: imageCount, max: maxImages })}
            </span>
          </span>
          <MediaGallery
            media={media}
            imageCount={imageCount}
            maxImages={maxImages}
            mediaProcessing={mediaProcessing}
            onRemove={onRemoveMedia}
            onAdd={handleAddClick}
            addButtonIcon={addButtonIcon}
          />
          <input
            ref={imageFileRef}
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            className="hidden"
            onChange={(e) => {
              onAddFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <input
            ref={videoFileRef}
            type="file"
            accept="video/*,.mp4,.mov,.m4v,.webm,.mkv,.avi,.3gp,.3gpp"
            className="hidden"
            onChange={(e) => {
              onAddFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3">
          <span className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Icon name="camera" size={17} className="text-primary" /> {t("them_anh")}
            </span>
            <span className="text-xs font-semibold text-primary">
              {t("anh_count_tren_max", { count: imageCount, max: maxImages })}
            </span>
          </span>
          {mediaLoading ? (
            <div className="flex gap-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-20 w-20 rounded-xl" />
              ))}
            </div>
          ) : (
            <MediaGallery
              media={media}
              imageCount={imageCount}
              maxImages={maxImages}
              mediaProcessing={mediaProcessing}
              onRemove={onRemoveMedia}
              onAdd={handleAddClick}
              addButtonIcon={addButtonIcon ?? <Icon name="image" size={22} />}
            />
          )}
          <input
            ref={imageFileRef}
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            className="hidden"
            onChange={(event) => {
              onAddFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          <input
            ref={videoFileRef}
            type="file"
            accept="video/*,.mp4,.mov,.m4v,.webm,.mkv,.avi,.3gp,.3gpp"
            className="hidden"
            onChange={(event) => {
              onAddFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
        </div>
      )}

      {/* ── Error ── */}
      {error && <p className="text-sm font-medium text-accent-700">{error}</p>}

      {/* ── Submit ── */}
      <Button
        type="submit"
        variant={mode === "create" ? "accent" : "primary"}
        size={mode === "create" ? "lg" : "md"}
        disabled={
          submitDisabled ??
          (busy || mediaProcessing || name.trim() === "" || media.length === 0)
        }
        icon={submitIcon}
      >
        {busy ? t("dang_luu") : submitLabel}
      </Button>

      {children}
    </form>
  );
}

// ---- Media Gallery sub-component ----

function MediaGallery({
  media,
  imageCount,
  maxImages,
  mediaProcessing,
  onRemove,
  onAdd,
  addButtonIcon,
}: {
  media: FormMedia[];
  imageCount: number;
  maxImages: number;
  mediaProcessing: boolean;
  onRemove: (index: number) => void;
  onAdd: () => void;
  addButtonIcon?: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap gap-2">
      {media.map((item, index) => {
        const galleryItems = media.map((m) => ({
          url: m.url,
          thumbnailUrl: m.thumbnailUrl,
          mediaType: m.type,
        }));
        return (
          <div
            key={`${item.kind}-${item.kind === "existing" ? item.id : item.url}`}
            className="relative h-20 w-20"
          >
            <MediaPreview
              url={item.url}
              thumbnailUrl={item.thumbnailUrl}
              mediaType={item.type}
              galleryItems={galleryItems}
              galleryIndex={index}
              className="h-20 w-20 rounded-xl object-cover"
            />
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent-500 text-white shadow"
              aria-label={item.type === "video" ? t("xoa_video") : t("xoa_anh")}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        );
      })}
      {imageCount < maxImages && (
        <button
          type="button"
          onClick={onAdd}
          disabled={mediaProcessing}
          className="flex h-20 w-20 flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-surface-muted text-muted-foreground disabled:cursor-wait disabled:opacity-60"
        >
          {mediaProcessing ? (
            <span className="text-xs">{t("dang_xu_ly")}</span>
          ) : (
            addButtonIcon ?? <Icon name="image" size={22} />
          )}
        </button>
      )}
    </div>
  );
}

import { useTranslation } from "react-i18next";
import { type HTMLAttributes, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import { cn } from "../lib/cn";
import { Icon } from "./ui/Icon";

export type MediaType = "image" | "video";

export interface MediaGalleryItem {
  url?: string | null;
  thumbnailUrl?: string | null;
  mediaType?: MediaType | null;
  alt?: string;
  caption?: ReactNode;
}

type ResolvedMediaGalleryItem = Omit<MediaGalleryItem, "url"> & { url: string };

interface MediaPreviewProps extends MediaGalleryItem {
  className?: string;
  imageClassName?: string;
  fallback?: ReactNode;
  galleryItems?: MediaGalleryItem[];
  galleryIndex?: number;
}

export function MediaPreview({
  url,
  thumbnailUrl,
  mediaType,
  alt = "",
  className,
  imageClassName,
  caption,
  fallback,
  galleryItems,
  galleryIndex = 0,
}: MediaPreviewProps) {
  const { t } = useTranslation();
  const items = useMemo(() => {
    const source = galleryItems?.length ? galleryItems : [{ url, thumbnailUrl, mediaType, alt, caption }];
    return source.filter((item): item is ResolvedMediaGalleryItem => !!item.url);
  }, [alt, caption, galleryItems, mediaType, thumbnailUrl, url]);
  const itemIndex = Math.min(Math.max(galleryIndex, 0), Math.max(items.length - 1, 0));
  const previewUrl = thumbnailUrl ?? url ?? undefined;
  const isVideo = mediaType === "video";
  const viewportWidth = typeof window === "undefined" ? 1280 : Math.max(1, window.innerWidth);
  const viewportHeight = typeof window === "undefined" ? 720 : Math.max(1, window.innerHeight);
  const [activeIndex, setActiveIndex] = useState(itemIndex);
  const [visible, setVisible] = useState(false);

  if (!url) return <>{fallback ?? null}</>;

  return (
    <PhotoProvider
      onIndexChange={(index) => setActiveIndex(index)}
      onVisibleChange={(nextVisible, index) => {
        setVisible(nextVisible);
        setActiveIndex(index);
      }}
      overlayRender={({ index }) => items[index]?.caption ?? null}
      toolbarRender={({ index, rotate, onRotate }) =>
        items[index]?.mediaType === "video" ? null : (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onRotate(rotate - 90)}
              className="flex h-10 w-10 items-center justify-center text-white/90 transition-colors hover:text-white"
              aria-label={t('xoay_trai')}
            >
              <Icon name="rotate-ccw" size={22} />
            </button>
            <button
              type="button"
              onClick={() => onRotate(rotate + 90)}
              className="flex h-10 w-10 items-center justify-center text-white/90 transition-colors hover:text-white"
              aria-label={t('xoay_phai')}
            >
              <Icon name="rotate-cw" size={22} />
            </button>
          </div>
        )
      }
    >
      {items.map((item, index) => (
        <PhotoView
          key={`${item.url}-${index}`}
          src={item.mediaType === "video" ? undefined : item.url}
          width={item.mediaType === "video" ? viewportWidth : undefined}
          height={item.mediaType === "video" ? viewportHeight : undefined}
          render={
            item.mediaType === "video"
              ? ({ attrs }) => (
                  <PreviewVideo
                    attrs={attrs}
                    src={item.url}
                    poster={item.thumbnailUrl ?? undefined}
                    active={visible && activeIndex === index}
                    className={cn("h-full w-full bg-black object-contain", attrs.className)}
                  />
                )
              : undefined
          }
        >
          {index === itemIndex ? (
            <button
              type="button"
              className={cn(
                "relative block overflow-hidden bg-black text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                className,
              )}
              aria-label={isVideo ? (alt ? t('phat_video_alt', { alt: alt }) : t('phat_video')) : (alt ? t('xem_anh_alt', { alt: alt }) : t('xem_anh'))}
            >
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={alt}
                  width={640}
                  height={480}
                  loading="lazy"
                  className={cn("h-full w-full object-cover", imageClassName)}
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-black text-white">
                  <Icon name={isVideo ? "video" : "image"} size={24} />
                </span>
              )}
              {isVideo && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white shadow-md backdrop-blur-sm">
                    <Icon name="play" size={22} className="ml-0.5 fill-white" />
                  </span>
                </span>
              )}
            </button>
          ) : (
            <span className="hidden" aria-hidden="true" />
          )}
        </PhotoView>
      ))}
    </PhotoProvider>
  );
}

function PreviewVideo({
  attrs,
  src,
  poster,
  active,
  className,
}: {
  attrs: Partial<HTMLAttributes<HTMLElement>>;
  src: string;
  poster?: string;
  active: boolean;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!active) {
      video.pause();
      return;
    }
    void video.play().catch(() => {
      // Browser autoplay policy can block this; controls remain available.
    });
  }, [active]);

  return (
    <video
      {...attrs}
      ref={videoRef}
      src={src}
      poster={poster}
      controls
      playsInline
      className={className}
      onClick={(event) => event.stopPropagation()}
    />
  );
}

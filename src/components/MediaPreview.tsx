import { type ReactNode, useEffect, useState } from "react";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import { cn } from "../lib/cn";
import { Icon } from "./ui/Icon";

export type MediaType = "image" | "video";

interface MediaPreviewProps {
  url?: string | null;
  thumbnailUrl?: string | null;
  mediaType?: MediaType | null;
  alt?: string;
  className?: string;
  imageClassName?: string;
  caption?: ReactNode;
  fallback?: ReactNode;
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
}: MediaPreviewProps) {
  const [playing, setPlaying] = useState(false);
  const isVideo = mediaType === "video";
  const previewUrl = thumbnailUrl ?? url ?? undefined;

  useEffect(() => {
    if (!playing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPlaying(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [playing]);

  if (!url) return <>{fallback ?? null}</>;

  if (!isVideo) {
    return (
      <PhotoProvider overlayRender={() => caption}>
        <PhotoView src={url}>
          <img
            src={previewUrl}
            alt={alt}
            className={cn(className, imageClassName, "cursor-zoom-in")}
          />
        </PhotoView>
      </PhotoProvider>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setPlaying(true)}
        className={cn(
          "relative block overflow-hidden bg-black text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        aria-label={alt ? `Phát video ${alt}` : "Phát video"}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={alt}
            className={cn("h-full w-full object-cover", imageClassName)}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-black text-white">
            <Icon name="video" size={24} />
          </span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/20">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white shadow-md backdrop-blur-sm">
            <Icon name="play" size={22} className="ml-0.5 fill-white" />
          </span>
        </span>
      </button>

      {playing && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setPlaying(false)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition hover:bg-white/25"
            aria-label="Đóng video"
            onClick={() => setPlaying(false)}
          >
            <Icon name="x" size={22} />
          </button>
          <div className="flex max-h-full w-full max-w-3xl flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <video
              src={url}
              poster={thumbnailUrl ?? undefined}
              controls
              autoPlay
              playsInline
              className="max-h-[78dvh] w-full rounded-lg bg-black object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}

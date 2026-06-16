import { trackError, trackEvent } from "./observability";

interface ShareOpts {
  filename: string;
  title: string;
  text: string;
  /** Deep link back to the item (shared as the Web Share `url`). */
  url?: string;
}

/**
 * Share a rendered image blob via the Web Share API (native sheet with the file
 * + link), falling back to a download, then to a text+url share. If the blob is
 * null (render failed), still shares the text + link.
 */
export async function shareImageBlob(blob: Blob | null, opts: ShareOpts): Promise<void> {
  const file = blob ? new File([blob], opts.filename, { type: "image/png" }) : null;

  if (file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: opts.title, text: opts.text, url: opts.url });
      trackEvent("native_share_success", { has_file: true });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        trackEvent("native_share_cancel", { has_file: true });
        return;
      }
      trackError(e, { feature: "share", action: "native_share" });
    }
  }

  // Fallback: download the image.
  if (blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = opts.filename;
    a.click();
    URL.revokeObjectURL(url);
    trackEvent("share_download_fallback");
    return;
  }

  // Last resort: share text + link only.
  if (navigator.share) {
    try {
      await navigator.share({ title: opts.title, text: opts.text, url: opts.url });
      trackEvent("native_share_success", { has_file: false });
    } catch {
      trackEvent("native_share_cancel", { has_file: false });
      /* cancelled */
    }
  }
}

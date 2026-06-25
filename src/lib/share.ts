import { trackError, trackEvent } from "./observability";

interface ShareOpts {
  title: string;
  text: string;
  /** Deep link back to the item (shared as the Web Share `url`). */
  url?: string;
}

/**
 * Share a link via the Web Share API (native sheet with text + link). The link
 * itself carries Open Graph meta for crawlers, so no image card is generated.
 * Falls back to copying the link to the clipboard where Web Share is missing.
 */
export async function shareLink(opts: ShareOpts): Promise<void> {
  if (navigator.share) {
    try {
      await navigator.share({ title: opts.title, text: opts.text, url: opts.url });
      trackEvent("native_share_success");
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        trackEvent("native_share_cancel");
        return;
      }
      trackError(e, { feature: "share", action: "native_share" });
    }
  }

  // Fallback: copy the link to the clipboard.
  if (opts.url) {
    try {
      await navigator.clipboard.writeText(opts.url);
      trackEvent("share_clipboard_fallback");
    } catch {
      /* clipboard blocked — nothing more we can do */
    }
  }
}

interface ShareOpts {
  filename: string;
  title: string;
  text: string;
  /** Deep link back to the item. Passed as the Web Share `url` (many targets
   *  keep the url even when they drop free text). */
  url?: string;
}

// 1×1 transparent PNG — html-to-image swaps this in for any image it can't
// inline (e.g. a photo blocked by missing CORS), so the card still renders
// instead of failing outright.
const TRANSPARENT_PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/**
 * Snapshot a DOM node (the card, with photos baked in) to a single PNG and share
 * it via the Web Share API, falling back to a download, then to a text+url
 * share. Fonts are skipped to avoid cross-origin embedding hangs.
 */
export async function shareCardNode(node: HTMLElement, opts: ShareOpts): Promise<void> {
  let blob: Blob | null = null;
  try {
    // Load the (sizeable) renderer on demand so it stays out of the main bundle.
    const { toPng } = await import("html-to-image");
    const dataUrl = await toPng(node, {
      pixelRatio: 2,
      cacheBust: true,
      skipFonts: true,
      imagePlaceholder: TRANSPARENT_PX,
    });
    blob = await (await fetch(dataUrl)).blob();
  } catch (e) {
    console.error("share card render failed:", e);
  }

  const file = blob ? new File([blob], opts.filename, { type: "image/png" }) : null;

  // Preferred: native share sheet with the single card image.
  if (file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: opts.title, text: opts.text, url: opts.url });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return; // user dismissed the sheet
    }
  }

  // Fallback: download the card image.
  if (blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = opts.filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  // Last resort: share text + link only.
  if (navigator.share) {
    try {
      await navigator.share({ title: opts.title, text: opts.text, url: opts.url });
    } catch {
      /* cancelled */
    }
  }
}

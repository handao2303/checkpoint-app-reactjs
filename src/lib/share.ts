interface ShareOpts {
  filename: string;
  title: string;
  text: string;
  /** Original photo URLs to attach alongside the card (best-effort — any that
   *  fail to fetch, e.g. blocked by CORS, are simply skipped). */
  photoUrls?: string[];
}

/** Fetch remote images as shareable File objects. Cross-origin fetches need the
 *  bucket to send CORS headers; failures are swallowed so one bad image never
 *  breaks the share. */
async function fetchPhotoFiles(urls: string[]): Promise<File[]> {
  const files = await Promise.all(
    urls.map(async (url, i) => {
      try {
        const res = await fetch(url, { mode: "cors" });
        if (!res.ok) return null;
        const blob = await res.blob();
        const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
        return new File([blob], `photo-${i + 1}.${ext}`, { type: blob.type || "image/jpeg" });
      } catch {
        return null;
      }
    }),
  );
  return files.filter((f): f is File => f !== null);
}

/**
 * Snapshot a DOM node to a PNG and share it (+ optional original photos) via the
 * Web Share API, falling back to a download, then to a text share. Fonts are
 * skipped to avoid cross-origin embedding hangs; cards read fine with a system
 * fallback font.
 */
export async function shareCardNode(node: HTMLElement, opts: ShareOpts): Promise<void> {
  let blob: Blob | null = null;
  try {
    // Load the (sizeable) renderer on demand so it stays out of the main bundle.
    const { toPng } = await import("html-to-image");
    const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true, skipFonts: true });
    blob = await (await fetch(dataUrl)).blob();
  } catch (e) {
    console.error("share card render failed:", e);
  }

  const cardFile = blob ? new File([blob], opts.filename, { type: "image/png" }) : null;
  const photoFiles = opts.photoUrls?.length ? await fetchPhotoFiles(opts.photoUrls) : [];
  const files = [cardFile, ...photoFiles].filter((f): f is File => f !== null);

  // Preferred: native share sheet with the card + photos.
  if (files.length && navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files, title: opts.title, text: opts.text });
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

  // Last resort: share text only.
  if (navigator.share) {
    try {
      await navigator.share({ title: opts.title, text: opts.text });
    } catch {
      /* cancelled */
    }
  }
}

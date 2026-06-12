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
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return; // user dismissed the sheet
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

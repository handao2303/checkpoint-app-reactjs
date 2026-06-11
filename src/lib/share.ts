interface ShareOpts {
  filename: string;
  title: string;
  text: string;
}

/**
 * Snapshot a DOM node to a PNG and share it via the Web Share API (native sheet
 * on mobile/PWA), falling back to a download, then to a text share. Fonts are
 * skipped to avoid cross-origin embedding hangs; cards are designed to read fine
 * with a system fallback font.
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

  const file = blob ? new File([blob], opts.filename, { type: "image/png" }) : null;

  // Preferred: native share sheet with the image file.
  if (file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: opts.title, text: opts.text });
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

  // Last resort: share text only.
  if (navigator.share) {
    try {
      await navigator.share({ title: opts.title, text: opts.text });
    } catch {
      /* cancelled */
    }
  }
}

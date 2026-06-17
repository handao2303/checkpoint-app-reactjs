import { useState } from "react";
import { Icon } from "../ui/Icon";
import { Button } from "../ui/Button";
import { shareImageBlob } from "../../lib/share";
import { trackError, trackEvent } from "../../lib/observability";

/** Share button that renders a card image (via a Canvas2D `render` fn) and shares
 *  it + a deep link. Canvas (not html-to-image) so photos render on iOS too. */
export function ShareButton({
  filename,
  title,
  text,
  url,
  label = "Chia sẻ",
  render,
}: {
  filename: string;
  title: string;
  text: string;
  /** Deep link back to the item (shared as the Web Share `url`). */
  url?: string;
  label?: string;
  render: () => Promise<Blob | null>;
}) {
  const [busy, setBusy] = useState(false);

  const onShare = async () => {
    setBusy(true);
    trackEvent("share_render_start");
    try {
      const blob = await render();
      trackEvent("share_render_success", { has_blob: !!blob });
      await shareImageBlob(blob, { filename, title, text, url });
    } catch (error) {
      trackError(error, { feature: "share", action: "share_render" });
      trackEvent("share_render_failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="green" icon={<Icon name="share" size={20} />} disabled={busy} onClick={onShare} className="w-full">
      {busy ? "Đang tạo ảnh..." : label}
    </Button>
  );
}

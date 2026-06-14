import { useState } from "react";
import { Icon } from "../ui/Icon";
import { Button } from "../ui/Button";
import { shareImageBlob } from "../../lib/share";

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
    try {
      const blob = await render();
      await shareImageBlob(blob, { filename, title, text, url });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="green" icon={<Icon name="share" size={20} />} disabled={busy} onClick={onShare}>
      {busy ? "Đang tạo ảnh..." : label}
    </Button>
  );
}

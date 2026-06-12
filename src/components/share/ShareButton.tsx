import { useRef, useState, type ReactNode } from "react";
import { Share2 } from "lucide-react";
import { Button } from "../ui/Button";
import { shareCardNode } from "../../lib/share";

/** A share button that snapshots a hidden card node to a PNG and shares it. The
 *  card (`children`) is rendered off-screen at a fixed size for a consistent
 *  output, then captured on tap. */
export function ShareButton({
  filename,
  title,
  text,
  label = "Chia sẻ",
  photoUrls,
  children,
}: {
  filename: string;
  title: string;
  text: string;
  label?: string;
  /** Original photos to attach alongside the generated card. */
  photoUrls?: string[];
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  const onShare = async () => {
    if (!ref.current) return;
    setBusy(true);
    try {
      await shareCardNode(ref.current, { filename, title, text, photoUrls });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="green" icon={<Share2 size={20} />} disabled={busy} onClick={onShare}>
        {busy ? "Đang tạo ảnh..." : label}
      </Button>
      {/* Off-screen, painted so html-to-image can capture it. */}
      <div className="pointer-events-none fixed -left-[9999px] top-0" aria-hidden>
        <div ref={ref}>{children}</div>
      </div>
    </>
  );
}

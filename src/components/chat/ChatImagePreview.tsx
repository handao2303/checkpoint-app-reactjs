import { Icon } from "../ui/Icon";

interface ChatImagePreviewProps {
  url: string;
  onClose: () => void;
}

/** Full-screen image viewer, tap-to-close. Lightweight — no zoom/pan. */
export function ChatImagePreview({ url, onClose }: ChatImagePreviewProps) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        aria-label="Đóng"
      >
        <Icon name="x" size={24} />
      </button>
      <img
        src={url}
        alt=""
        className="max-h-full max-w-full rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

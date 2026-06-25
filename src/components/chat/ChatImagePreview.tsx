import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";

interface ChatImagePreviewProps {
  url: string;
  onClose: () => void;
}

/** Full-screen image viewer with zoom, pinch, and swipe. */
export function ChatImagePreview({ url, onClose }: ChatImagePreviewProps) {
  return (
    <Lightbox
      open
      close={onClose}
      slides={[{ src: url }]}
      plugins={[Zoom]}
      animation={{ swipe: 300 }}
      zoom={{ maxZoomPixelRatio: 3 }}
      carousel={{ finite: true }}
    />
  );
}

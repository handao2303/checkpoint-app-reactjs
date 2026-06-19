import { useEffect, type RefObject } from "react";

type UseDismissableLayerOptions<T extends HTMLElement> = {
  ref: RefObject<T | null>;
  open: boolean;
  onDismiss: () => void;
  closeOnEscape?: boolean;
};

export function useDismissableLayer<T extends HTMLElement>({
  ref,
  open,
  onDismiss,
  closeOnEscape = true,
}: UseDismissableLayerOptions<T>) {
  useEffect(() => {
    if (!open) return;

    function handlePointerStart(event: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onDismiss();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (closeOnEscape && event.key === "Escape") {
        onDismiss();
      }
    }

    document.addEventListener("mousedown", handlePointerStart);
    document.addEventListener("touchstart", handlePointerStart);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerStart);
      document.removeEventListener("touchstart", handlePointerStart);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeOnEscape, onDismiss, open, ref]);
}

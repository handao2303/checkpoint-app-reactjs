import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

/**
 * A bottom sheet modal.
 * Drag the header to make it taller/shorter.
 * Min height is locked to the initial natural content height.
 * Max height is ~92% of the viewport.
 */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const headerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const drag = useRef<{ startY: number; startH: number } | null>(null);

  // Lock min height after first drag measurement.
  // This prevents min height from growing when the sheet expands.
  const minHeightRef = useRef<number | null>(null);

  const [height, setHeight] = useState<number | null>(null);

  const maxHeight = () => Math.round(window.innerHeight * 0.92);

  const getNaturalHeight = () => {
    const headerHeight = headerRef.current?.offsetHeight ?? 0;
    const contentHeight = contentRef.current?.offsetHeight ?? 0;
    return headerHeight + contentHeight;
  };

  function getMinHeight() {
    const max = maxHeight();

    if (minHeightRef.current === null) {
      minHeightRef.current = Math.min(getNaturalHeight(), max);
    }

    return minHeightRef.current;
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const currentHeight = headerRef.current?.parentElement?.offsetHeight ?? 0;

    // Capture the initial natural height only once.
    getMinHeight();

    drag.current = {
      startY: e.clientY,
      startH: currentHeight,
    };

    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;

    const min = getMinHeight();
    const max = maxHeight();

    // Drag up = taller, drag down = shorter
    const next = drag.current.startH + (drag.current.startY - e.clientY);

    setHeight(Math.max(min, Math.min(max, next)));
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40" />

      <div
        className="relative z-10 flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-2xl bg-surface shadow-lg"
        style={height === null ? undefined : { height }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          ref={headerRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="shrink-0 cursor-grab touch-none select-none px-4 pt-2 active:cursor-grabbing"
        >
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border" />
          {title && (
            <h2 className="mb-2 font-display text-lg font-bold">{title}</h2>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div ref={contentRef}>{children}</div>
        </div>
      </div>
    </div>
  );
}
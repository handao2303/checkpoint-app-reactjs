import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { cn } from "../../lib/cn";

/** A bottom sheet modal. Drag the header to resize.
 *  - default: floor = content height, ceiling = ~92vh, body scrolls.
 *  - grow: opens tall and the body is a flex column, so a `flex-1` child (e.g. a
 *    map) grows/shrinks as you drag. */
export function Sheet({
  title,
  onClose,
  grow = false,
  children,
}: {
  title?: string;
  onClose: () => void;
  grow?: boolean;
  children: ReactNode;
}) {
  const headerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startH: number } | null>(null);
  const [height, setHeight] = useState<number | null>(() =>
    grow ? Math.round(window.innerHeight * 0.7) : null,
  );

  const maxHeight = () => Math.round(window.innerHeight * 0.92);
  const minHeight = () => {
    if (grow) return Math.round(window.innerHeight * 0.4);
    const content = (headerRef.current?.offsetHeight ?? 0) + (contentRef.current?.offsetHeight ?? 0);
    return Math.min(content, maxHeight());
  };

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    drag.current = { startY: e.clientY, startH: headerRef.current?.parentElement?.offsetHeight ?? 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const next = drag.current.startH + (drag.current.startY - e.clientY); // up = taller
    setHeight(Math.max(minHeight(), Math.min(maxHeight(), next)));
  }
  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" onClick={onClose}>
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
          {title && <h2 className="mb-2 font-display text-lg font-bold">{title}</h2>}
        </div>

        <div
          className={cn(
            "px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]",
            grow ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "flex-1 overflow-y-auto",
          )}
        >
          <div ref={contentRef} className={grow ? "flex min-h-0 flex-1 flex-col" : "mt-2"}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

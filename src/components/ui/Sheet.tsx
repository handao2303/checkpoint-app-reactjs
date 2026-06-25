import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Icon } from "./Icon";

// Keep in sync with the slide-down-out duration in index.css.
const CLOSE_MS = 320;

/** A bottom sheet modal. Drag the header to resize.
 *  - default: floor = content height, ceiling = ~92vh, body scrolls.
 *  - grow: opens tall and the body is a flex column, so a `flex-1` child (e.g. a
 *    map) grows/shrinks as you drag. */
export function Sheet({
  title,
  onClose,
  grow = false,
  className,
  children,
}: {
  title?: string;
  onClose: () => void;
  grow?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const hasCustomHeight = /\b(?:h-|min-h-|max-h-|\[height:|\[max-height:)/.test(className ?? "");
  const allowsFullHeight = /\b(?:h-full|h-\[100dvh\]|max-h-\[100dvh\]|h-screen|max-h-screen)/.test(className ?? "");
  const headerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startH: number } | null>(null);
  const closeTimer = useRef<number | null>(null);
  const [closing, setClosing] = useState(false);
  const [height, setHeight] = useState<number | null>(() =>
    grow && !hasCustomHeight ? Math.round(window.innerHeight * 0.7) : null,
  );

  useEffect(() => () => {
    if (closeTimer.current != null) window.clearTimeout(closeTimer.current);
  }, []);

  // Play the slide-down animation, then unmount via the parent's onClose.
  function requestClose() {
    if (closing) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(onClose, CLOSE_MS);
  }

  const maxHeight = () => Math.round(window.innerHeight * (allowsFullHeight ? 1 : 0.92));
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
    <div className="fixed inset-0 z-40 flex items-end justify-center" onClick={requestClose}>
      <div className={cn("absolute inset-0 bg-black/40", closing ? "animate-fade-out" : "animate-fade-in")} />
      <div
        className={cn(
          "relative z-10 flex w-full max-w-md flex-col rounded-t-[28px] border border-border bg-surface shadow-lg",
          !hasCustomHeight && "max-h-[92dvh]",
          closing ? "animate-slide-down-out" : "animate-slide-up-in",
          className,
        )}
        style={height === null ? undefined : { height }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={requestClose}
          aria-label={t('dong')}
          className="absolute right-3 top-2 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground shadow-sm transition-colors hover:bg-primary-50 hover:text-primary"
        >
          <Icon name="x" size={20} />
        </button>

        <div
          ref={headerRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="min-h-11 shrink-0 cursor-grab touch-none select-none px-4 pr-14 pt-2 active:cursor-grabbing"
        >
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border" />
          {title && <h2 className="mb-2 font-display text-lg font-extrabold text-foreground">{title}</h2>}
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

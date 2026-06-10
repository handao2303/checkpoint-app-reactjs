import type { ReactNode } from "react";

/** A bottom sheet modal: dimmed backdrop + slide-up panel. */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative z-10 max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border" />
        {title && <h2 className="mb-3 font-display text-lg font-bold">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

/** Placeholder shown while the map chunk loads and maplibre paints its first
 *  frame. Lives in the main bundle (no maplibre import) so it can also be the
 *  Suspense fallback for the lazy map route — giving a seamless loader from
 *  navigation → chunk load → map ready. */
export function MapSkeleton({ hidden = false }: { hidden?: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 z-10 overflow-hidden bg-surface-muted transition-opacity duration-500 ${
        hidden ? "opacity-0" : "opacity-100"
      }`}
      aria-hidden
    >
      {/* faux map strokes to read as a map skeleton, gently pulsing */}
      <div className="absolute inset-0 animate-pulse">
        <div className="absolute left-0 top-1/3 h-3 w-full -rotate-6 bg-border/60" />
        <div className="absolute left-0 top-2/3 h-2 w-full rotate-3 bg-border/50" />
        <div className="absolute left-1/4 top-0 h-full w-2.5 rotate-3 bg-border/50" />
        <div className="absolute left-2/3 top-0 h-full w-2 -rotate-2 bg-border/40" />
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <img src="/logo.png" alt="" className="h-20 w-auto animate-pulse object-contain" />
        <span className="text-sm font-medium text-muted-foreground">Đang tải bản đồ…</span>
      </div>
    </div>
  );
}

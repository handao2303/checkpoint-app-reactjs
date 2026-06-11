import { cn } from "../../lib/cn";

/** A theme-aware pulsing placeholder block. Compose with sizing utilities. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-muted", className)} />;
}

/** Shared loading state for the checkpoint/place detail sheets. */
export function DetailSheetSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 overflow-hidden">
        <Skeleton className="h-44 w-60 shrink-0 rounded-lg" />
        <Skeleton className="h-44 w-60 shrink-0 rounded-lg" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-6 w-40" />
      </div>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-7 w-7 rounded-full" />
        <Skeleton className="h-4 w-28" />
      </div>
    </div>
  );
}

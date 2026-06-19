import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-xl border border-border bg-surface p-4 shadow-card", className)}
      {...props}
    />
  );
}

/** A soft image placeholder used in place of real photos in this scaffold. */
export function ImagePlaceholder({
  className,
  label,
}: {
  className?: string;
  label?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg border border-border bg-surface-muted text-sm font-medium text-clay-800/70",
        className,
      )}
    >
      {label}
    </div>
  );
}

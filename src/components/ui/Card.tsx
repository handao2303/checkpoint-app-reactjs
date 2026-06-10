import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-xl bg-surface p-4 shadow-card", className)}
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
  label?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg bg-gradient-to-br from-green-200 to-clay-200 text-sm font-medium text-clay-800/70",
        className,
      )}
    >
      {label}
    </div>
  );
}

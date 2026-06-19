import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "accent" | "green" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Pill (fully rounded) — the default for primary CTAs in the mockups. */
  pill?: boolean;
  icon?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: "border border-primary bg-primary text-primary-foreground shadow-cta hover:bg-primary-600",
  accent: "border border-primary bg-primary text-white shadow-cta hover:bg-primary-600",
  green: "border border-green-600 bg-green-600 text-white shadow-sm hover:bg-green-700",
  outline: "border border-primary/45 bg-surface text-primary shadow-sm hover:bg-primary-50",
  ghost: "text-foreground hover:bg-surface-muted",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-5 text-base",
  lg: "h-14 px-6 text-lg",
};

export function Button({
  variant = "primary",
  size = "md",
  pill = true,
  icon,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 font-display font-extrabold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-60",
        pill ? "rounded-full" : "rounded-xl",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

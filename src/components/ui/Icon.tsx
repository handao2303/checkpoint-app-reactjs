import type { SVGProps } from "react";
import { icons, type IconName } from "../../icons/registry";

export type { IconName };

type IconProps = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: IconName;
  /** Square size in px (sets width and height). Defaults to 24. */
  size?: number;
};

/**
 * Self-hosted SVG icon. Renders a glyph from the local registry inside a shared
 * 24x24 <svg> wrapper. Color inherits via `currentColor` (use Tailwind `text-*`);
 * add a `fill-current`/`fill-*` class to fill an outline glyph.
 */
export function Icon({ name, size = 24, strokeWidth = 2, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {icons[name]}
    </svg>
  );
}

import { cn } from "../../lib/cn";
import { Icon } from "./Icon";

type UserAvatarProps = {
  src?: string | null;
  name?: string | null;
  username?: string | null;
  alt?: string;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  loading?: "eager" | "lazy";
  fit?: "cover" | "contain";
  shape?: "circle" | "none";
  width?: number;
  height?: number;
};

function avatarInitial(name?: string | null, username?: string | null) {
  const source = name?.trim() || username?.trim();
  return source?.slice(0, 1).toUpperCase() ?? "";
}

export function UserAvatar({
  src,
  name,
  username,
  alt = "",
  className = "h-10 w-10",
  imageClassName,
  fallbackClassName,
  loading = "lazy",
  fit = "contain",
  shape = "circle",
  width = 96,
  height = 96,
}: UserAvatarProps) {
  const shapeClass = shape === "circle" ? "rounded-full" : undefined;

  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={loading}
        className={cn(
          "shrink-0",
          shapeClass,
          fit === "cover" ? "object-cover" : "object-contain",
          className,
          imageClassName,
        )}
      />
    );
  }

  const initial = avatarInitial(name, username);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center border border-primary-100 bg-primary-50 font-extrabold text-primary-700 shadow-sm",
        shapeClass,
        className,
        fallbackClassName,
      )}
    >
      {initial || <Icon name="user" size={18} />}
    </span>
  );
}

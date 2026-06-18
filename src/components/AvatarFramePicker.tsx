import { Icon } from "./ui/Icon";
import { UserAvatar } from "./ui/UserAvatar";
import type { AvatarFrame } from "../lib/avatarFrames";
import { cn } from "../lib/cn";

export interface FrameOption {
  frame: AvatarFrame;
  unlocked: boolean;
}

// The frame SVG's avatar hole (viewBox 220): center (110,104), radius ~65.
// Positions a sample disc behind the frame art in each thumbnail.
const HOLE = { left: "50%", top: "47.3%", size: "59%" };

function FrameThumb({
  frame,
  avatarUrl,
}: {
  frame: AvatarFrame | null;
  avatarUrl?: string;
}) {
  return (
    <span className="relative block h-16 w-16">
      {/* sample disc behind the ring */}
      <span
        className="absolute -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full bg-surface-muted"
        style={{ left: HOLE.left, top: HOLE.top, width: HOLE.size, height: HOLE.size }}
      >
        <UserAvatar
          src={avatarUrl}
          className="h-full w-full"
          fallbackClassName="bg-surface-muted text-muted-foreground"
          fit="cover"
        />
      </span>
      {frame && (
        <img src={frame.file} alt="" className="absolute inset-0 h-full w-full" draggable={false} />
      )}
    </span>
  );
}

/**
 * Horizontal strip of avatar frames. The first chip is "no frame"; locked
 * frames show a lock overlay and can't be selected.
 */
export function AvatarFramePicker({
  options,
  selectedId,
  onSelect,
  avatarUrl,
}: {
  options: FrameOption[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  avatarUrl?: string;
}) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {/* None */}
      <button
        type="button"
        onClick={() => onSelect(null)}
        className="flex shrink-0 flex-col items-center gap-1"
        aria-pressed={selectedId === null}
      >
        <span
          className={cn(
            "flex h-16 w-16 items-center justify-center rounded-full border-2",
            selectedId === null ? "border-primary" : "border-border",
          )}
        >
          <span className="relative flex h-[59%] w-[59%] items-center justify-center overflow-hidden rounded-full bg-surface-muted">
            <UserAvatar
              src={avatarUrl}
              className="h-full w-full"
              fallbackClassName="bg-surface-muted text-muted-foreground"
              fit="cover"
            />
          </span>
        </span>
        <span className="w-16 truncate text-center text-[10px] text-muted-foreground">Không khung</span>
      </button>

      {options.map(({ frame, unlocked }) => {
        const selected = selectedId === frame.id;
        return (
          <button
            key={frame.id}
            type="button"
            disabled={!unlocked}
            onClick={() => onSelect(frame.id)}
            className="flex shrink-0 flex-col items-center gap-1 disabled:cursor-not-allowed"
            aria-pressed={selected}
            title={unlocked ? frame.label : `${frame.label} — chưa mở khóa`}
          >
            <span
              className={cn(
                "relative rounded-full border-2 transition",
                selected ? "border-primary" : "border-transparent",
              )}
            >
              <span className={cn(!unlocked && "opacity-40 grayscale")}>
                <FrameThumb frame={frame} avatarUrl={avatarUrl} />
              </span>
              {!unlocked && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <Icon name="lock" size={16} className="text-muted-foreground" />
                </span>
              )}
            </span>
            <span
              className={cn(
                "w-16 truncate text-center text-[10px]",
                selected ? "font-semibold text-primary" : "text-muted-foreground",
              )}
            >
              {frame.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import { Icon } from "./ui/Icon";
import { Sheet } from "./ui/Sheet";
import { Button } from "./ui/Button";
import { AvatarFramePicker, type FrameOption } from "./AvatarFramePicker";
import { composeAvatar } from "../lib/avatarComposite";
import { frameById } from "../lib/avatarFrames";

const CROP_SIZE = 512; // Output square edge in px
const JPEG_QUALITY = 0.9;

function getRadianAngle(degree: number): number {
  return (degree * Math.PI) / 180;
}

function rotateSize(width: number, height: number, rotation: number) {
  const rad = getRadianAngle(rotation);
  return {
    width: Math.abs(Math.cos(rad) * width) + Math.abs(Math.sin(rad) * height),
    height: Math.abs(Math.sin(rad) * width) + Math.abs(Math.cos(rad) * height),
  };
}

/** Crop an image from a source URL + croppedAreaPixels and return a Blob
 *  (square 512px JPEG at quality 0.9). Adapted from react-easy-crop examples. */
async function getCroppedBlob(
  imageSrc: string,
  pixelCrop: Area,
  rotation = 0,
): Promise<Blob> {
  const image = new Image();
  image.src = imageSrc;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = reject;
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2d context");

  const rotRad = getRadianAngle(rotation);
  const { width: bBoxWidth, height: bBoxHeight } = rotateSize(
    image.width,
    image.height,
    rotation,
  );

  canvas.width = bBoxWidth;
  canvas.height = bBoxHeight;

  ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  ctx.rotate(rotRad);
  ctx.translate(-image.width / 2, -image.height / 2);
  ctx.drawImage(image, 0, 0);

  const data = ctx.getImageData(pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height);

  // Downscale to CROP_SIZE × CROP_SIZE
  canvas.width = CROP_SIZE;
  canvas.height = CROP_SIZE;
  ctx.putImageData(data, 0, 0);

  // drawImage + putImageData loses scale; re-draw scaled
  const offscreen = document.createElement("canvas");
  offscreen.width = bBoxWidth;
  offscreen.height = bBoxHeight;
  const offCtx = offscreen.getContext("2d");
  if (!offCtx) throw new Error("No 2d context");
  offCtx.translate(bBoxWidth / 2, bBoxHeight / 2);
  offCtx.rotate(rotRad);
  offCtx.translate(-image.width / 2, -image.height / 2);
  offCtx.drawImage(image, 0, 0);

  canvas.width = CROP_SIZE;
  canvas.height = CROP_SIZE;
  ctx.drawImage(
    offscreen,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    CROP_SIZE,
    CROP_SIZE,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob returned null"));
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

interface AvatarCropSheetProps {
  imageSrc: string;
  onClose: () => void;
  /** Receives the final avatar blob (frame baked in when one is chosen) and the
   *  selected frame id (null = no frame). */
  onDone: (blob: Blob, frameId: string | null) => void;
  /** Avatar frames to offer below the cropper. Omit to hide the frame picker. */
  frameOptions?: FrameOption[];
  /** Pre-selected frame id (e.g. the user's current frame). */
  initialFrameId?: string | null;
}

// Live preview transform: the frame fills the box (viewBox→box), then is scaled
// about its hole (50%, 47.27% of viewBox) so the hole matches the round crop
// circle, and nudged down so the hole centres in the box. The decorations spill
// past the box and are clipped by the cropper's overflow — same framing the
// baked PNG produces. (HOLE_R 66 / 220 = 30% → scale 0.5/0.30 = 1.667.)
const FRAME_OVERLAY_STYLE: React.CSSProperties = {
  transformOrigin: "31% 47.27%",
  transform: "translateY(2.73%) scale(1.7)",
};

/** Full-screen crop sheet for avatar images. 1:1 crop with circular mask,
 *  zoom slider, optional avatar-frame picker, and drag-to-reposition. "Xong"
 *  crops → downscales to 512px → bakes the chosen frame → returns a Blob. */
export function AvatarCropSheet({
  imageSrc,
  onClose,
  onDone,
  frameOptions,
  initialFrameId = null,
}: AvatarCropSheetProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);
  const [frameId, setFrameId] = useState<string | null>(initialFrameId);

  const selectedFrame = frameById(frameId);

  // Reset zoom when image changes
  useEffect(() => {
    setZoom(1);
    setCrop({ x: 0, y: 0 });
  }, [imageSrc]);

  const onCropComplete = useCallback(
    (_croppedArea: Area, croppedPixels: Area) => {
      setCroppedAreaPixels(croppedPixels);
    },
    [],
  );

  const handleDone = async () => {
    if (!croppedAreaPixels) return;
    setProcessing(true);
    let croppedUrl: string | null = null;
    try {
      const blob = await getCroppedBlob(imageSrc, croppedAreaPixels);
      croppedUrl = URL.createObjectURL(blob);
      // Always bake: a frame medallion, or a plain circular mask when none.
      const baked = await composeAvatar(croppedUrl, selectedFrame?.file ?? null);
      onDone(baked, selectedFrame?.id ?? null);
    } catch {
      // If crop/compose fails, pass the original image through as fallback
      const res = await fetch(imageSrc);
      onDone(await res.blob(), null);
    } finally {
      if (croppedUrl) URL.revokeObjectURL(croppedUrl);
      setProcessing(false);
    }
  };

  return (
    <Sheet title="Cắt ảnh đại diện" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {/* Cropper */}
        <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-lg bg-black">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            objectFit="cover"
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
          {/* Live frame preview overlay */}
          {selectedFrame && (
            <img
              src={selectedFrame.file}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-4/5"
              style={FRAME_OVERLAY_STYLE}
            />
          )}
        </div>

        {/* Zoom slider */}
        <div className="flex items-center gap-3 px-2">
          <Icon name="zoom-out" size={18} className="text-muted-foreground shrink-0" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-2 flex-1 appearance-none rounded-full bg-surface-muted accent-primary"
            aria-label="Zoom"
          />
          <Icon name="zoom-in" size={18} className="text-muted-foreground shrink-0" />
        </div>

        {/* Frame picker */}
        {frameOptions && frameOptions.length > 0 && (
          <div>
            <p className="mb-1.5 text-sm font-semibold text-foreground">Khung avatar</p>
            <AvatarFramePicker
              options={frameOptions}
              selectedId={frameId}
              onSelect={setFrameId}
              avatarUrl={imageSrc}
            />
          </div>
        )}

        {/* Actions */}
        <Button
          onClick={handleDone}
          disabled={processing}
          icon={processing ? undefined : <Icon name="check" size={18} />}
          className="w-full"
        >
          {processing ? "Đang xử lý..." : "Xong"}
        </Button>
      </div>
    </Sheet>
  );
}

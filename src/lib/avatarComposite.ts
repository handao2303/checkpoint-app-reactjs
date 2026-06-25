// Bakes the avatar into a square PNG so its shape travels with the image and
// needs no clipping at display time. With a frame, the full medallion (rim,
// laurels, level plate, accents) is rendered around the avatar that sits in the
// frame's hole; without a frame, the avatar is masked to a centred circle on a
// transparent square. Either way the result is shown with `object-contain` and
// no circular clip, so framed avatars display in full ("floating") rather than
// being cropped to a circle.

import axios from "axios";

// Frame geometry (the new raster frames are exported from a 220x220 template).
const FRAME_VIEWBOX = 220;
const HOLE_CX = 110;
const HOLE_CY = 104;
const HOLE_R = 66; // avatar hole radius (rim inner edge)

const OUTPUT_SIZE = 512;
const FRAMED_SIZE = 440;
const FRAMED_OFFSET = (OUTPUT_SIZE - FRAMED_SIZE) / 2;
const FRAMED_AVATAR_ZOOM = 1.3;
// Unframed: a centred disc that nearly fills the square (small transparent gap).
const PLAIN_R = OUTPUT_SIZE / 2 - 6;

/** Thrown when the source avatar can't be drawn to a canvas (cross-origin taint). */
export class TaintedAvatarError extends Error {
  constructor() {
    super("avatar image is cross-origin and cannot be re-encoded");
    this.name = "TaintedAvatarError";
  }
}

function loadImage(src: string, crossOrigin?: "anonymous"): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = crossOrigin;
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load image: ${src}`));
    img.src = src;
  });
}

/** Detect frame format from URL extension. */
function isSvgFrame(url: string): boolean {
  return /\.svg(\?|$)/i.test(url);
}

/** Load an SVG as a same-origin blob URL so drawing it never taints the canvas. */
async function loadSvgFrame(url: string): Promise<{ img: HTMLImageElement; revoke: () => void }> {
  // Distinct query so this CORS request never reuses a non-CORS copy the page
  // already cached via a plain <img> (the frame preview). That cached response
  // lacks Access-Control-Allow-Origin and would otherwise fail the CORS check.
  const res = await axios.get(url + (url.includes("?") ? "&" : "?") + "cors=1", {
    responseType: "text",
  });
  if (res.status !== 200) throw new Error(`failed to fetch frame: ${url}`);
  const text = res.data as string;
  const blob = new Blob([text], { type: "image/svg+xml" });
  const objUrl = URL.createObjectURL(blob);
  try {
    const img = await loadImage(objUrl);
    return { img, revoke: () => URL.revokeObjectURL(objUrl) };
  } catch (err) {
    URL.revokeObjectURL(objUrl);
    throw err;
  }
}

/** Load a raster (PNG) frame with CORS so it can be drawn to canvas. */
async function loadRasterFrame(url: string): Promise<{ img: HTMLImageElement; revoke: () => void }> {
  const separator = url.includes("?") ? "&" : "?";
  const img = await loadImage(url + separator + "cors=1", "anonymous");
  return { img, revoke: () => {} };
}

/** Load any frame (SVG or raster) for compositing. */
async function loadFrameImage(
  url: string,
): Promise<{ img: HTMLImageElement; revoke: () => void }> {
  return isSvgFrame(url) ? loadSvgFrame(url) : loadRasterFrame(url);
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new TaintedAvatarError())), type);
  });
}

/** Cover-fit a (square-ish) source into a circle on the canvas. */
function drawAvatarInCircle(
  ctx: CanvasRenderingContext2D,
  avatar: HTMLImageElement,
  cx: number,
  cy: number,
  r: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  const side = Math.min(avatar.width, avatar.height);
  const sx = (avatar.width - side) / 2;
  const sy = (avatar.height - side) / 2;
  ctx.drawImage(avatar, sx, sy, side, side, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

/**
 * Build the baked avatar PNG. `frameUrl` null → plain circular avatar.
 * `avatarSrc` may be a blob/object URL (clean) or a remote URL (loaded with
 * CORS — throws TaintedAvatarError if the host disallows reading it back).
 */
export async function composeAvatar(
  avatarSrc: string,
  frameUrl: string | null,
  opts: { remote?: boolean } = {},
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");

  const avatar = await loadImage(avatarSrc, opts.remote ? "anonymous" : undefined);

  if (!frameUrl) {
    drawAvatarInCircle(ctx, avatar, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, PLAIN_R);
    return canvasToBlob(canvas, "image/png");
  }

  const frame = await loadFrameImage(frameUrl);
  try {
    if (isSvgFrame(frameUrl)) {
      // SVG frames follow the 220x220 viewBox template with a known hole.
      const scale = FRAMED_SIZE / FRAME_VIEWBOX;
      drawAvatarInCircle(
        ctx,
        avatar,
        FRAMED_OFFSET + HOLE_CX * scale,
        FRAMED_OFFSET + HOLE_CY * scale,
        HOLE_R * scale * FRAMED_AVATAR_ZOOM,
      );
      ctx.drawImage(frame.img, FRAMED_OFFSET, FRAMED_OFFSET, FRAMED_SIZE, FRAMED_SIZE);
    } else {
      // Raster (PNG) frames: use the image's intrinsic size to derive geometry.
      // Assumes the frame is square and the design follows the same hole layout.
      const fw = frame.img.naturalWidth || frame.img.width;
      const fh = frame.img.naturalHeight || frame.img.height;
      const frameSize = Math.max(fw, fh) || OUTPUT_SIZE;
      const scale = FRAMED_SIZE / frameSize;
      drawAvatarInCircle(
        ctx,
        avatar,
        FRAMED_OFFSET + HOLE_CX * scale,
        FRAMED_OFFSET + HOLE_CY * scale,
        HOLE_R * scale * FRAMED_AVATAR_ZOOM,
      );
      ctx.drawImage(frame.img, FRAMED_OFFSET, FRAMED_OFFSET, FRAMED_SIZE, FRAMED_SIZE);
    }
    return await canvasToBlob(canvas, "image/png");
  } finally {
    frame.revoke();
  }
}

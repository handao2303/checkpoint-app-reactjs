import { t } from "./i18n";
import { trackError, trackEvent } from "./observability";

const MAX_DURATION_SECONDS = 10;
// Input cap (advisory UX check). The raw file is uploaded as-is to the backend,
// which transcodes it to a compressed MP4 and enforces the authoritative limit.
// Source files (MOV/WebM/high-bitrate) are larger than the result, so the cap is
// generous and matches the server's maxVideoInputBytes (60 MiB).
const MAX_INPUT_VIDEO_BYTES = 60 * 1024 * 1024;
const THUMBNAIL_MAX_EDGE = 640;
type Rotation = 0 | 90 | 180 | 270;

/**
 * Validate a short video and generate its JPEG thumbnail client-side. The video
 * itself is returned untouched as `original` — conversion to MP4 now happens on
 * the backend (via ffmpeg), because many browsers cannot produce MP4 themselves.
 * The caller uploads `original` to the backend transcode endpoint.
 */
export async function prepareCheckpointVideo(file: File): Promise<{ original: File; thumbnail: File }> {
  if (!isProbablyVideo(file)) {
    throw new Error(t('file_khong_phai_video'));
  }
  if (file.size > MAX_INPUT_VIDEO_BYTES) {
    throw new Error(t('video_qua_lon_toi_da', { roundMAX_INPUT_VIDEO_BYTES10241024: Math.round(MAX_INPUT_VIDEO_BYTES / (1024 * 1024)) }));
  }
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  const url = URL.createObjectURL(file);
  video.src = url;
  const revoke = () => URL.revokeObjectURL(url);

  try {
    await waitForEvent(video, "loadedmetadata", t('khong_doc_duoc_metadata_video'));
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error(t('khong_doc_duoc_do_dai'));
    }
    if (video.duration > MAX_DURATION_SECONDS) {
      throw new Error(t('video_qua_dai_toi_da'));
    }
    const rotation = normalizeRotationForCanvas(await readMP4Rotation(file), video);

    video.currentTime = Math.min(1, Math.max(0, video.duration / 2));
    await waitForEvent(video, "seeked", t('khong_lay_duoc_khung_hinh'));

    const canvas = document.createElement("canvas");
    setCanvasSize(canvas, video, THUMBNAIL_MAX_EDGE, rotation);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(t('khong_tao_duoc_canvas_thumbnail'));
    drawVideoFrame(ctx, video, rotation);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(t('khong_tao_duoc_anh_thumbnail')))), "image/jpeg", 0.85);
    });
    const thumbnail = new File([blob], file.name.replace(/\.\w+$/, "") + "-thumb.jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
    trackEvent("video_prepare_success", { video_size: file.size, thumbnail_size: thumbnail.size });
    return { original: file, thumbnail };
  } catch (e) {
    trackError(e, { feature: "checkin", action: "video_prepare" });
    trackEvent("video_prepare_failed");
    throw e;
  } finally {
    revoke();
  }
}

function waitForEvent(video: HTMLVideoElement, event: "loadedmetadata" | "seeked", message: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => cleanup(() => reject(new Error(message))), 7000);
    const onSuccess = () => cleanup(resolve);
    const onError = () => cleanup(() => reject(new Error(message)));

    const cleanup = (done: () => void) => {
      window.clearTimeout(timeout);
      video.removeEventListener(event, onSuccess);
      video.removeEventListener("error", onError);
      done();
    };

    video.addEventListener(event, onSuccess, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

function isProbablyVideo(file: File): boolean {
  return file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv|avi|3gp|3gpp)$/i.test(file.name);
}

function setCanvasSize(canvas: HTMLCanvasElement, video: HTMLVideoElement, maxEdge: number, rotation: Rotation) {
  const rotated = rotation === 90 || rotation === 270;
  const displayWidth = rotated ? video.videoHeight : video.videoWidth;
  const displayHeight = rotated ? video.videoWidth : video.videoHeight;
  const scale = Math.min(1, maxEdge / Math.max(displayWidth, displayHeight));
  canvas.width = Math.max(1, Math.round(displayWidth * scale));
  canvas.height = Math.max(1, Math.round(displayHeight * scale));
}

function drawVideoFrame(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, rotation: Rotation) {
  const { canvas } = ctx;
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (rotation === 90) {
    ctx.translate(canvas.width, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(video, 0, 0, canvas.height, canvas.width);
  } else if (rotation === 270) {
    ctx.translate(0, canvas.height);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(video, 0, 0, canvas.height, canvas.width);
  } else if (rotation === 180) {
    ctx.translate(canvas.width, canvas.height);
    ctx.rotate(Math.PI);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  }
  ctx.restore();
}

function normalizeRotationForCanvas(rotation: Rotation, video: HTMLVideoElement): Rotation {
  if ((rotation === 90 || rotation === 270) && video.videoWidth < video.videoHeight) {
    return 0;
  }
  return rotation;
}

async function readMP4Rotation(file: File): Promise<Rotation> {
  if (!/\.(mp4|m4v|mov|3gp|3gpp)$/i.test(file.name)) return 0;
  try {
    const data = new DataView(await file.arrayBuffer());
    for (let offset = 4; offset < data.byteLength - 64; offset++) {
      if (
        data.getUint8(offset) !== 0x74 ||
        data.getUint8(offset + 1) !== 0x6b ||
        data.getUint8(offset + 2) !== 0x68 ||
        data.getUint8(offset + 3) !== 0x64
      ) {
        continue;
      }
      const boxStart = offset - 4;
      const size = data.getUint32(boxStart);
      if (size < 84 || boxStart + size > data.byteLength) continue;
      const version = data.getUint8(offset + 4);
      const matrixOffset = boxStart + (version === 1 ? 60 : 48);
      if (matrixOffset + 20 > data.byteLength) continue;
      const a = Math.round(data.getInt32(matrixOffset) / 65536);
      const b = Math.round(data.getInt32(matrixOffset + 4) / 65536);
      const c = Math.round(data.getInt32(matrixOffset + 12) / 65536);
      const d = Math.round(data.getInt32(matrixOffset + 16) / 65536);
      if (a === 0 && b === 1 && c === -1 && d === 0) return 90;
      if (a === 0 && b === -1 && c === 1 && d === 0) return 270;
      if (a === -1 && b === 0 && c === 0 && d === -1) return 180;
      return 0;
    }
  } catch {
    return 0;
  }
  return 0;
}

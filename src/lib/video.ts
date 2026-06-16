import { trackError, trackEvent } from "./observability";

const MAX_DURATION_SECONDS = 10;
const MAX_VIDEO_BYTES = 12 * 1024 * 1024;
const THUMBNAIL_MAX_EDGE = 640;
type Rotation = 0 | 90 | 180 | 270;

/**
 * Validate a short video, generate its JPEG thumbnail client-side, and output
 * an MP4 file. Non-MP4 inputs are converted when the browser supports MP4
 * MediaRecorder output.
 */
export async function prepareCheckpointVideo(file: File): Promise<{ original: File; thumbnail: File }> {
  if (!isProbablyVideo(file)) {
    throw new Error("File không phải video.");
  }
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  const url = URL.createObjectURL(file);
  video.src = url;
  const revoke = () => URL.revokeObjectURL(url);

  try {
    await waitForEvent(video, "loadedmetadata", "Không đọc được metadata video.");
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error("Không đọc được độ dài video.");
    }
    if (video.duration > MAX_DURATION_SECONDS) {
      throw new Error("Video quá dài. Tối đa 10 giây.");
    }
    const rotation = normalizeRotationForCanvas(await readMP4Rotation(file), video);

    video.currentTime = Math.min(1, Math.max(0, video.duration / 2));
    await waitForEvent(video, "seeked", "Không lấy được khung hình video.");

    const canvas = document.createElement("canvas");
    setCanvasSize(canvas, video, THUMBNAIL_MAX_EDGE, rotation);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Không tạo được canvas thumbnail.");
    drawVideoFrame(ctx, video, rotation);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Không tạo được ảnh thumbnail."))), "image/jpeg", 0.85);
    });
    const thumbnail = new File([blob], file.name.replace(/\.\w+$/, "") + "-thumb.jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
    const needsConvert = !isMP4(file) || file.size > MAX_VIDEO_BYTES || rotation !== 0;
    const original = needsConvert ? await convertToMP4(video, file, rotation) : normalizeMP4File(file);
    trackEvent("video_prepare_success", { video_size: original.size, thumbnail_size: thumbnail.size });
    return { original, thumbnail };
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

function isMP4(file: File): boolean {
  return file.type === "video/mp4" || /\.(mp4|m4v)$/i.test(file.name);
}

function normalizeMP4File(file: File): File {
  if (file.type === "video/mp4" && /\.mp4$/i.test(file.name)) return file;
  const name = file.name.replace(/\.\w+$/, "") + ".mp4";
  return new File([file], name, { type: "video/mp4", lastModified: file.lastModified });
}

async function convertToMP4(video: HTMLVideoElement, file: File, rotation: Rotation): Promise<File> {
  if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) {
    throw new Error("Trình duyệt chưa hỗ trợ chuyển video sang MP4. Hãy thử video MP4 dưới 12MB.");
  }

  const mimeType = ["video/mp4;codecs=avc1.42E01E", "video/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
  if (!mimeType) {
    throw new Error("Trình duyệt chưa hỗ trợ xuất MP4. Hãy thử video MP4 dưới 12MB.");
  }

  const canvas = document.createElement("canvas");
  setCanvasSize(canvas, video, 720, rotation);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Không tạo được canvas nén video.");

  video.currentTime = 0;
  await waitForEvent(video, "seeked", "Không tua được video để nén.");
  const stream = canvas.captureStream(24);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 2_500_000,
  });
  const chunks: Blob[] = [];
  recorder.addEventListener("dataavailable", (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  });

  let frame = 0;
  const draw = () => {
    if (video.paused || video.ended) return;
    drawVideoFrame(ctx, video, rotation);
    frame = window.requestAnimationFrame(draw);
  };

  const stopped = new Promise<void>((resolve, reject) => {
    recorder.addEventListener("stop", () => resolve(), { once: true });
    recorder.addEventListener("error", () => reject(new Error("Nén video thất bại.")), { once: true });
  });

  recorder.start(250);
  await video.play();
  draw();
  await new Promise<void>((resolve) => {
    video.addEventListener("ended", () => resolve(), { once: true });
  });
  if (frame) window.cancelAnimationFrame(frame);
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((track) => track.stop());

  const blob = new Blob(chunks, { type: "video/mp4" });
  if (blob.size === 0) throw new Error("Chuyển video sang MP4 thất bại.");
  if (blob.size > MAX_VIDEO_BYTES) {
    throw new Error("Video sau khi chuyển sang MP4 vẫn quá lớn. Hãy chọn video ngắn/nhẹ hơn.");
  }
  return new File([blob], file.name.replace(/\.\w+$/, "") + "-converted.mp4", {
    type: "video/mp4",
    lastModified: Date.now(),
  });
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

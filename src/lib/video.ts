import { trackError, trackEvent } from "./observability";

const MAX_DURATION_SECONDS = 12;
const MAX_VIDEO_BYTES = 12 * 1024 * 1024;
const THUMBNAIL_MAX_EDGE = 640;

/**
 * Validate a short MP4 video, generate its JPEG thumbnail client-side, and
 * compress oversized videos when the browser supports MP4 MediaRecorder output.
 */
export async function prepareCheckpointVideo(file: File): Promise<{ original: File; thumbnail: File }> {
  if (file.type !== "video/mp4" && !/\.mp4$/i.test(file.name)) {
    throw new Error("Video phải là MP4.");
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

    video.currentTime = Math.min(1, Math.max(0, video.duration / 2));
    await waitForEvent(video, "seeked", "Không lấy được khung hình video.");

    const canvas = document.createElement("canvas");
    const scale = Math.min(1, THUMBNAIL_MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Không tạo được canvas thumbnail.");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Không tạo được ảnh thumbnail."))), "image/jpeg", 0.85);
    });
    const thumbnail = new File([blob], file.name.replace(/\.\w+$/, "") + "-thumb.jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
    const original = file.size > MAX_VIDEO_BYTES ? await compressVideo(video, file) : file;
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

async function compressVideo(video: HTMLVideoElement, file: File): Promise<File> {
  if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) {
    throw new Error("Trình duyệt chưa hỗ trợ nén video. Hãy chọn MP4 dưới 12MB.");
  }

  const mimeType = ["video/mp4;codecs=avc1.42E01E", "video/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
  if (!mimeType) {
    throw new Error("Trình duyệt chưa hỗ trợ nén MP4. Hãy chọn MP4 dưới 12MB.");
  }

  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
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
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
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
  if (blob.size === 0) throw new Error("Nén video thất bại.");
  if (blob.size > MAX_VIDEO_BYTES) {
    throw new Error("Video sau khi nén vẫn quá lớn. Hãy chọn video ngắn/nhẹ hơn.");
  }
  return new File([blob], file.name.replace(/\.\w+$/, "") + "-compressed.mp4", {
    type: "video/mp4",
    lastModified: Date.now(),
  });
}

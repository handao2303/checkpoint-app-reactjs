import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Webcam from "react-webcam";
import { Icon } from "./ui/Icon";
import { trackEvent } from "../lib/observability";
type Facing = "user" | "environment";
type CameraDevice = { info: MediaDeviceInfo; facing?: Facing };

// MediaTrackCapabilities doesn't include zoom in the TS DOM lib yet.
type ExtendedCapabilities = MediaTrackCapabilities & {
  zoom?: { min: number; max: number; step: number };
};

const CAMERA_DEVICE_KEYS: Record<Facing, string> = {
  user: "cp_camera_device_user",
  environment: "cp_camera_device_environment",
};

function loadSavedDevice(facing: Facing): string | null {
  try {
    return localStorage.getItem(CAMERA_DEVICE_KEYS[facing]);
  } catch {
    return null;
  }
}

function saveDevice(facing: Facing, deviceId: string) {
  try {
    localStorage.setItem(CAMERA_DEVICE_KEYS[facing], deviceId);
  } catch {
    // Storage can be unavailable in private browsing; selection still works.
  }
}

function clearSavedDevice(facing: Facing) {
  try {
    localStorage.removeItem(CAMERA_DEVICE_KEYS[facing]);
  } catch {
    // Non-fatal; the fallback facing-mode camera can still open.
  }
}

async function toCameraFile(blob: Blob, mirror = false): Promise<File> {
  if (!mirror) {
    return new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
  }

  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
  }
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const cropped = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.95),
  );
  return new File([cropped ?? blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
}

/** Crop the centre region of a blob proportional to the CSS zoom level. */
async function cropToZoom(blob: Blob, zoom: number): Promise<Blob> {
  if (zoom <= 1.01) return blob;
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  const croppedW = width / zoom;
  const croppedH = height / zoom;
  const sx = (width - croppedW) / 2;
  const sy = (height - croppedH) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(croppedW);
  canvas.height = Math.round(croppedH);
  const ctx = canvas.getContext("2d");
  if (!ctx) { bitmap.close(); return blob; }
  ctx.drawImage(bitmap, sx, sy, croppedW, croppedH, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b ?? blob), "image/jpeg", 0.95),
  );
}

function getTouchDistance(touches: React.TouchList): number {
  const [t1, t2] = [touches[0], touches[1]];
  return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
}

function inferFacing(device: MediaDeviceInfo): Facing | undefined {
  try {
    const capabilities = (device as InputDeviceInfo).getCapabilities?.();
    if (capabilities?.facingMode?.includes("user")) return "user";
    if (capabilities?.facingMode?.includes("environment")) return "environment";
  } catch {
    // Some browsers expose getCapabilities but reject for inactive devices.
  }

  const label = device.label.toLowerCase();
  if (/\b(front|user)\b/.test(label)) return "user";
  if (/\b(back|rear|environment)\b/.test(label)) return "environment";
  return undefined;
}

function lensPreferenceScore(device: CameraDevice): number {
  const label = device.info.label.toLowerCase();
  if (/\b(ultra[\s-]?wide|0[.,]5x?|tele(photo)?|macro|depth|tof)\b/.test(label)) return -100;
  if (/\b(main|primary|standard|normal|1x)\b/.test(label)) return 100;
  if (/\bwide\b/.test(label)) return 40;
  if (/^(back|rear) camera$/.test(label)) return 20;
  return 0;
}

function preferredDefaultLens(
  cameras: CameraDevice[],
  activeDeviceId: string | null,
): CameraDevice | undefined {
  const environmentCameras = cameras.filter((camera) => camera.facing === "environment");
  const active = environmentCameras.find((camera) => camera.info.deviceId === activeDeviceId);
  const best = [...environmentCameras].sort(
    (a, b) => lensPreferenceScore(b) - lensPreferenceScore(a),
  )[0];
  if (!best || lensPreferenceScore(best) <= 0) return undefined;
  return !active || lensPreferenceScore(best) > lensPreferenceScore(active) ? best : undefined;
}

function isPhonePwa(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

const MIN_ZOOM = 1;
const MAX_ZOOM_FALLBACK = 5; // CSS-scale max when hardware zoom isn't available

/**
 * Full-screen in-app camera for check-in photos. Live preview, shutter, camera
 * facing switch, lens selection, and a Photos button for the gallery picker.
 * Supports pinch-to-zoom: uses hardware zoom (track constraints) when available,
 * falls back to CSS scale + centre-crop on capture.
 * After each shot, a preview is shown with "Chụp lại" / "Tiếp tục" / "Xong".
 * Shoot up to `maxCount` photos then "Xong"; the captured Files are returned
 * via onDone (the caller runs them through the downscale pipeline). If the
 * camera can't open (denied, old iOS PWA), it shows a gallery fallback instead.
 */
export function CameraCaptureSheet({
  onClose,
  onDone,
  maxCount = 3,
}: {
  onClose: () => void;
  onDone: (files: File[]) => void;
  maxCount?: number;
}) {
  const webcamRef = useRef<Webcam>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [selectedDeviceId, setSelectedDeviceId] = useState(() => loadSavedDevice("environment"));
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [mirrored, setMirrored] = useState(false);
  const [error, setError] = useState(false);
  const fallbackAttempted = useRef(false);
  const defaultLensAttempted = useRef(false);
  const phonePwa = isPhonePwa();
  const facingDevices = devices.filter((device) => device.facing === facing);
  const currentDevice = facingDevices.find((device) => device.info.deviceId === activeDeviceId);
  const currentDeviceIndex = facingDevices.findIndex((device) => device.info.deviceId === activeDeviceId);
  const currentDeviceLabel = currentDevice
    ? currentDevice.info.label || `Camera ${facing === "user" ? "trước" : "sau"} ${currentDeviceIndex + 1}`
    : null;
  const videoConstraints: MediaTrackConstraints = {
    ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : { facingMode: facing }),
    width: { ideal: 3840 },
    height: { ideal: 2160 },
  };

  // Accumulated shots for this session.
  const [shots, setShots] = useState<{ file: File; url: string }[]>([]);
  const [mode, setMode] = useState<"viewfinder" | "preview">("viewfinder");
  const shotsRef = useRef(shots);
  shotsRef.current = shots;

  useEffect(() => () => { shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url)); }, []);

  const isFull = shots.length >= maxCount;
  const previewUrl = mode === "preview" ? shots[shots.length - 1]?.url : null;

  // ---- Zoom state ----
  const [zoom, setZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(MAX_ZOOM_FALLBACK);
  const [useHardwareZoom, setUseHardwareZoom] = useState(false);
  const [showZoomLabel, setShowZoomLabel] = useState(false);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const useHardwareZoomRef = useRef(useHardwareZoom);
  useHardwareZoomRef.current = useHardwareZoom;
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const zoomLabelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);

  function flashZoomLabel() {
    setShowZoomLabel(true);
    if (zoomLabelTimer.current) clearTimeout(zoomLabelTimer.current);
    zoomLabelTimer.current = setTimeout(() => setShowZoomLabel(false), 1500);
  }

  function applyZoom(newZoom: number) {
    const clamped = Math.max(MIN_ZOOM, Math.min(maxZoom, newZoom));
    setZoom(clamped);
    flashZoomLabel();
    if (useHardwareZoomRef.current && trackRef.current) {
      try {
        trackRef.current.applyConstraints({
          advanced: [{ zoom: clamped } as MediaTrackConstraintSet],
        });
      } catch {
        // Hardware zoom failed silently; CSS fallback already active.
      }
    }
  }

  function handlePinchStart(e: React.TouchEvent) {
    if (e.touches.length !== 2) return;
    pinchRef.current = { startDist: getTouchDistance(e.touches), startZoom: zoomRef.current };
  }

  function handlePinchMove(e: React.TouchEvent) {
    if (e.touches.length !== 2 || !pinchRef.current) return;
    const ratio = getTouchDistance(e.touches) / pinchRef.current.startDist;
    applyZoom(pinchRef.current.startZoom * ratio);
  }

  function handlePinchEnd() {
    pinchRef.current = null;
  }

  function resetZoom() {
    setZoom(1);
    setShowZoomLabel(false);
    if (trackRef.current && useHardwareZoomRef.current) {
      try {
        trackRef.current.applyConstraints({ advanced: [{ zoom: 1 } as MediaTrackConstraintSet] });
      } catch { /* best-effort */ }
    }
  }
  // ---- End zoom state ----

  const handleUserMedia = useCallback(
    async (stream: MediaStream) => {
      const settings = stream.getVideoTracks()[0]?.getSettings();
      const deviceId = settings?.deviceId ?? selectedDeviceId;
      const activeFacing: Facing =
        settings?.facingMode === "user" || settings?.facingMode === "environment"
          ? settings.facingMode
          : facing;

      setError(false);
      trackEvent("camera_open", { facing: activeFacing, hardware_zoom: false });
      setActiveDeviceId(deviceId ?? null);
      setFacing(activeFacing);
      setMirrored(activeFacing === "user");

      const track = stream.getVideoTracks()[0];
      trackRef.current = track ?? null;

      // Reset zoom when a new camera stream starts.
      setZoom(1);
      setUseHardwareZoom(false);
      setMaxZoom(MAX_ZOOM_FALLBACK);

      try {
        const capabilities = track?.getCapabilities() as ExtendedCapabilities | undefined;
        if (capabilities && "focusMode" in capabilities) {
          await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] });
        }
        // Detect hardware zoom support.
        if (capabilities?.zoom) {
          setUseHardwareZoom(true);
          setMaxZoom(Math.min(capabilities.zoom.max, 10));
        }
      } catch {
        // Continuous autofocus is best-effort and unsupported on many browsers.
      }

      try {
        const cameras = (await navigator.mediaDevices.enumerateDevices())
          .filter((device) => device.kind === "videoinput")
          .map((info): CameraDevice => ({
            info,
            facing: info.deviceId === deviceId ? activeFacing : inferFacing(info),
          }));
        setDevices(cameras);

        if (
          activeFacing === "environment" &&
          !selectedDeviceId &&
          !defaultLensAttempted.current
        ) {
          defaultLensAttempted.current = true;
          const preferred = preferredDefaultLens(cameras, deviceId ?? null);
          if (preferred) {
            saveDevice("environment", preferred.info.deviceId);
            setSelectedDeviceId(preferred.info.deviceId);
          }
        }
      } catch {
        setDevices([]);
      }
    },
    [facing, selectedDeviceId],
  );

  const handleUserMediaError = useCallback(() => {
    if (selectedDeviceId && !fallbackAttempted.current) {
      fallbackAttempted.current = true;
      clearSavedDevice(facing);
      setSelectedDeviceId(null);
      setActiveDeviceId(null);
      setMirrored(facing === "user");
      trackEvent("camera_error", { facing, fallback: true });
      return;
    }
    setError(true);
    trackEvent("camera_error", { facing, fallback: false });
  }, [facing, selectedDeviceId]);

  const switchFacing = () => {
    const nextFacing: Facing = facing === "user" ? "environment" : "user";
    fallbackAttempted.current = false;
    setError(false);
    setFacing(nextFacing);
    setSelectedDeviceId(loadSavedDevice(nextFacing));
    setActiveDeviceId(null);
    setMirrored(nextFacing === "user");
    resetZoom();
    trackEvent("camera_switch", { facing: nextFacing });
  };

  const selectLens = (deviceId: string) => {
    fallbackAttempted.current = false;
    setError(false);
    saveDevice(facing, deviceId);
    setSelectedDeviceId(deviceId);
    resetZoom();
    trackEvent("camera_lens_select", { facing });
  };

  const capture = useCallback(async () => {
    if (shotsRef.current.length >= maxCount) return;
    let blob: Blob | null = null;
    let capturedWithImageCapture = false;
    const video = webcamRef.current?.video;
    const track = (video?.srcObject as MediaStream | null)?.getVideoTracks()[0];

    if (/Android/i.test(navigator.userAgent) && track && typeof ImageCapture !== "undefined") {
      try {
        blob = await new ImageCapture(track).takePhoto();
        capturedWithImageCapture = true;
      } catch {
        // Fall back to react-webcam's source-sized screenshot.
      }
    }
    if (!blob) {
      const dataUrl = webcamRef.current?.getScreenshot();
      if (!dataUrl) return;
      blob = await (await fetch(dataUrl)).blob();
    }

    // When using CSS zoom (no hardware), crop the captured frame to the
    // same centre region the viewfinder shows.
    if (!useHardwareZoomRef.current && zoomRef.current > 1.01) {
      blob = await cropToZoom(blob, zoomRef.current);
    }

    const file = await toCameraFile(blob, capturedWithImageCapture && mirrored);
    const url = URL.createObjectURL(file);
    setShots((prev) => [...prev, { file, url }]);
    setMode("preview");
    trackEvent("camera_capture", { count: shotsRef.current.length + 1 });
  }, [maxCount, mirrored]);

  const retake = () => {
    setShots((prev) => {
      const last = prev[prev.length - 1];
      if (last) URL.revokeObjectURL(last.url);
      return prev.slice(0, -1);
    });
    setMode("viewfinder");
  };

  const continueCapture = () => setMode("viewfinder");

  const finish = () => {
    trackEvent("camera_done", { count: shotsRef.current.length });
    onDone(shotsRef.current.map((s) => s.file));
    onClose();
  };

  const addFromGallery = (list: FileList | null) => {
    if (!list) return;
    const remaining = maxCount - shotsRef.current.length;
    const files = Array.from(list).slice(0, remaining);
    if (!files.length) return;
    setShots((prev) => [
      ...prev,
      ...files.map((f) => ({ file: f, url: URL.createObjectURL(f) })),
    ]);
    trackEvent("camera_gallery_pick", { count: files.length });
    // Gallery files are already reviewed by the user; stay in viewfinder.
  };

  const content = (
    <div className="fixed inset-0 z-[100] flex h-dvh w-screen flex-col bg-black">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] text-white">
        <button
          type="button"
          onClick={() => {
            trackEvent("camera_close", { count: shots.length });
            onClose();
          }}
          aria-label="Đóng"
          className="p-1"
        >
          <Icon name="x" size={26} />
        </button>
        <span className="text-sm font-semibold tabular-nums text-white/80">
          {shots.length}/{maxCount}
        </span>
        {mode === "viewfinder" && shots.length > 0 ? (
          <button type="button" onClick={finish} className="px-1 text-sm font-semibold text-white">
            Xong
          </button>
        ) : (
          <span className="w-10" />
        )}
      </div>

      {/* Camera / Preview area */}
      <div
        className="relative flex-1 overflow-hidden"
        style={{ touchAction: "none" }}
        onTouchStart={handlePinchStart}
        onTouchMove={handlePinchMove}
        onTouchEnd={handlePinchEnd}
      >
        {/* Preview (last captured shot) */}
        {mode === "preview" && previewUrl && (
          <img src={previewUrl} alt="Xem trước" className="h-full w-full object-cover" />
        )}

        {/* Viewfinder — always mounted so the camera stream stays warm */}
        <div className={mode === "preview" ? "hidden" : "h-full w-full"}>
          {error ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center text-white">
              <Icon name="image" size={40} className="opacity-70" />
              <p className="text-sm text-white/80">
                Không mở được camera. Hãy chọn ảnh từ thư viện.
              </p>
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black"
              >
                Chọn từ thư viện
              </button>
            </div>
          ) : (
            <Webcam
              ref={webcamRef}
              audio={false}
              screenshotFormat="image/jpeg"
              screenshotQuality={0.95}
              forceScreenshotSourceSize
              mirrored={mirrored}
              videoConstraints={videoConstraints}
              onUserMedia={handleUserMedia}
              onUserMediaError={handleUserMediaError}
              className="h-full w-full object-cover transition-transform duration-75"
              style={!useHardwareZoom && zoom !== 1 ? { transform: `scale(${zoom})` } : undefined}
            />
          )}
        </div>

        {/* Zoom level indicator — fades out after 1.5 s */}
        {mode === "viewfinder" && showZoomLabel && zoom !== 1 && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2">
            <span className="rounded-full bg-black/60 px-4 py-1.5 text-sm font-bold text-white backdrop-blur-sm">
              {zoom.toFixed(1)}×
            </span>
          </div>
        )}
      </div>

      {/* Lens selector (viewfinder only) */}
      {mode === "viewfinder" && !error && currentDeviceLabel && (
        <div className="flex flex-col items-center gap-2 px-4 pt-3 text-white">
          <span className="max-w-full truncate rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
            {currentDeviceLabel}
          </span>
          {facingDevices.length > 1 && (
            <div className="flex items-center justify-center gap-2">
              {facingDevices.map((device, index) => {
                const active = device.info.deviceId === activeDeviceId;
                return (
                  <button
                    key={device.info.deviceId}
                    type="button"
                    onClick={() => selectLens(device.info.deviceId)}
                    aria-label={`Chọn camera ${index + 1}`}
                    aria-pressed={active}
                    className={`flex h-9 min-w-9 items-center justify-center rounded-full px-3 text-sm font-semibold ${
                      active ? "bg-white text-black" : "bg-white/15 text-white"
                    }`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Preview bottom controls: Chụp lại · Tiếp tục · Xong */}
      {mode === "preview" && (
        <div className="flex items-center justify-around px-6 py-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
          <button
            type="button"
            onClick={retake}
            className="rounded-full bg-white/15 px-5 py-3 text-sm font-semibold text-white"
          >
            Chụp lại
          </button>
          {!isFull && (
            <button
              type="button"
              onClick={continueCapture}
              className="rounded-full bg-white/15 px-5 py-3 text-sm font-semibold text-white"
            >
              Tiếp tục
            </button>
          )}
          <button
            type="button"
            onClick={finish}
            className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black"
          >
            Xong
          </button>
        </div>
      )}

      {/* Viewfinder bottom controls: Photos · Shutter · Flip front/back */}
      {mode === "viewfinder" && (
        <div className="grid grid-cols-3 items-center px-10 py-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            aria-label="Chọn từ thư viện"
            className="justify-self-start text-white"
          >
            {phonePwa ? (
              <span className="flex min-w-16 flex-col items-center gap-1 text-xs font-medium">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15">
                  <Icon name="image" size={24} />
                </span>
                Thư viện
              </span>
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/15">
                <Icon name="image" size={24} />
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={capture}
            disabled={error || isFull}
            aria-label="Chụp ảnh"
            className="h-[4.5rem] w-[4.5rem] justify-self-center rounded-full border-4 border-white p-1 disabled:opacity-40"
          >
            <span className="block h-full w-full rounded-full bg-white" />
          </button>

          <button
            type="button"
            onClick={switchFacing}
            aria-label="Lật camera trước sau"
            className="flex h-12 w-12 items-center justify-center justify-self-end rounded-full bg-white/15 text-white"
          >
            <Icon name="switch-camera" size={24} />
          </button>
        </div>
      )}

      <input
        ref={galleryRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="hidden"
        onChange={(e) => {
          addFromGallery(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );

  return createPortal(content, document.body);
}

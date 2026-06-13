import { useCallback, useRef, useState } from "react";
import Webcam from "react-webcam";
import { X, SwitchCamera, Image as ImageIcon } from "lucide-react";

type Facing = "user" | "environment";
type Ratio = "4:3" | "1:1" | "16:9";
export type CameraResult = { file: File; source: "camera" | "library" };
type CameraDevice = { info: MediaDeviceInfo; facing?: Facing };
const RATIO_KEY = "cp_camera_ratio";
const RATIOS: Ratio[] = ["4:3", "1:1", "16:9"];

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

function loadRatio(): Ratio {
  try {
    const value = localStorage.getItem(RATIO_KEY) as Ratio | null;
    return value && RATIOS.includes(value) ? value : "4:3";
  } catch {
    return "4:3";
  }
}

function ratioValue(ratio: Ratio): number {
  const [width, height] = ratio.split(":").map(Number);
  return width / height;
}

async function cropBlob(blob: Blob, ratio: Ratio, mirror = false): Promise<File> {
  const bitmap = await createImageBitmap(blob);
  const targetRatio = ratioValue(ratio);
  let sourceWidth = bitmap.width;
  let sourceHeight = bitmap.height;
  if (sourceWidth / sourceHeight > targetRatio) sourceWidth = sourceHeight * targetRatio;
  else sourceHeight = sourceWidth / targetRatio;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sourceWidth);
  canvas.height = Math.round(sourceHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
  }
  if (mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(bitmap, (bitmap.width - sourceWidth) / 2, (bitmap.height - sourceHeight) / 2, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const cropped = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.95),
  );
  return new File([cropped ?? blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
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
    window.matchMedia("(pointer: coarse)").matches &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

/**
 * Full-screen in-app camera for check-in photos. Live preview, shutter, camera
 * facing switch, lens selection, and a Photos button for the gallery picker.
 * Shoot up to `maxCount` photos then "Xong"; the captured Files are returned via
 * onDone (the caller runs them through the downscale pipeline). If the camera
 * can't open (denied, old iOS PWA), it shows a gallery fallback instead.
 */
export function CameraCaptureSheet({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (files: CameraResult[]) => void;
}) {
  const webcamRef = useRef<Webcam>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [selectedDeviceId, setSelectedDeviceId] = useState(() => loadSavedDevice("environment"));
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [mirrored, setMirrored] = useState(false);
  const [ratio, setRatio] = useState<Ratio>(loadRatio);
  const [resolution, setResolution] = useState<string | null>(null);
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

  const handleUserMedia = useCallback(
    async (stream: MediaStream) => {
      const settings = stream.getVideoTracks()[0]?.getSettings();
      const deviceId = settings?.deviceId ?? selectedDeviceId;
      const activeFacing: Facing =
        settings?.facingMode === "user" || settings?.facingMode === "environment"
          ? settings.facingMode
          : facing;

      setError(false);
      setActiveDeviceId(deviceId ?? null);
      setFacing(activeFacing);
      setMirrored(activeFacing === "user");
      setResolution(settings?.width && settings?.height ? `${settings.width} × ${settings.height}` : null);

      const track = stream.getVideoTracks()[0];
      try {
        const capabilities = track?.getCapabilities();
        if (capabilities && "focusMode" in capabilities) {
          await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] });
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
      return;
    }
    setError(true);
  }, [facing, selectedDeviceId]);

  const switchFacing = () => {
    const nextFacing: Facing = facing === "user" ? "environment" : "user";
    fallbackAttempted.current = false;
    setError(false);
    setFacing(nextFacing);
    setSelectedDeviceId(loadSavedDevice(nextFacing));
    setActiveDeviceId(null);
    setMirrored(nextFacing === "user");
  };

  const selectLens = (deviceId: string) => {
    fallbackAttempted.current = false;
    setError(false);
    saveDevice(facing, deviceId);
    setSelectedDeviceId(deviceId);
  };

  const selectRatio = (next: Ratio) => {
    setRatio(next);
    try {
      localStorage.setItem(RATIO_KEY, next);
    } catch {
      // The selected ratio still applies for the current camera session.
    }
  };

  const capture = useCallback(async () => {
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

    const file = await cropBlob(blob, ratio, capturedWithImageCapture && mirrored);
    onDone([{ file, source: "camera" }]);
    onClose();
  }, [mirrored, onClose, onDone, ratio]);

  const addFromGallery = (list: FileList | null) => {
    const file = list?.[0];
    if (!file) return;
    onDone([{ file, source: "library" }]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] text-white">
        <button type="button" onClick={onClose} aria-label="Đóng" className="p-1">
          <X size={26} />
        </button>
        <span className="w-10" />
      </div>

      {/* Viewfinder */}
      <div className="relative flex-1 overflow-hidden">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center text-white">
            <ImageIcon size={40} className="opacity-70" />
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
            className="h-full w-full object-cover"
          />
        )}
      </div>

      {!error && currentDeviceLabel && (
        <div className="flex flex-col items-center gap-2 px-4 pt-3 text-white">
          <div className="flex items-center justify-center gap-2">
            {RATIOS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => selectRatio(item)}
                aria-pressed={ratio === item}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  ratio === item ? "bg-white text-black" : "bg-white/15 text-white"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
          <span className="max-w-full truncate rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
            {currentDeviceLabel}
            {resolution ? ` · ${resolution}` : ""}
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

      {/* Bottom controls: Photos · Shutter · Flip front/back */}
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
                <ImageIcon size={24} />
              </span>
              Thư viện
            </span>
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/15">
              <ImageIcon size={24} />
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={capture}
          disabled={error}
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
          <SwitchCamera size={24} />
        </button>
      </div>

      <input
        ref={galleryRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="hidden"
        onChange={(e) => {
          addFromGallery(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

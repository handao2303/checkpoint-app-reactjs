import { useCallback, useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import { X, SwitchCamera, Image as ImageIcon, Check } from "lucide-react";

type Facing = "user" | "environment";
type Shot = { file: File; url: string };
type CameraDevice = { info: MediaDeviceInfo; facing?: Facing };

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

/**
 * Full-screen in-app camera for check-in photos. Live preview, shutter, camera
 * facing switch, lens selection, and a Photos button for the gallery picker.
 * Shoot up to `maxCount` photos then "Xong"; the captured Files are returned via
 * onDone (the caller runs them through the downscale pipeline). If the camera
 * can't open (denied, old iOS PWA), it shows a gallery fallback instead.
 */
export function CameraCaptureSheet({
  maxCount,
  onClose,
  onDone,
}: {
  maxCount: number;
  onClose: () => void;
  onDone: (files: File[]) => void;
}) {
  const webcamRef = useRef<Webcam>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [selectedDeviceId, setSelectedDeviceId] = useState(() => loadSavedDevice("environment"));
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [mirrored, setMirrored] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  const [error, setError] = useState(false);
  const fallbackAttempted = useRef(false);

  const shotsRef = useRef(shots);
  shotsRef.current = shots;
  useEffect(() => () => shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url)), []);

  const full = shots.length >= maxCount;
  const facingDevices = devices.filter((device) => device.facing === facing);
  const currentDevice = facingDevices.find((device) => device.info.deviceId === activeDeviceId);
  const currentDeviceIndex = facingDevices.findIndex((device) => device.info.deviceId === activeDeviceId);
  const currentDeviceLabel = currentDevice
    ? currentDevice.info.label || `Camera ${facing === "user" ? "trước" : "sau"} ${currentDeviceIndex + 1}`
    : null;
  const videoConstraints: MediaTrackConstraints = selectedDeviceId
    ? { deviceId: { exact: selectedDeviceId } }
    : { facingMode: facing };

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

      try {
        const cameras = (await navigator.mediaDevices.enumerateDevices())
          .filter((device) => device.kind === "videoinput")
          .map((info): CameraDevice => ({
            info,
            facing: info.deviceId === deviceId ? activeFacing : inferFacing(info),
          }));
        setDevices(cameras);
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

  const capture = useCallback(async () => {
    if (shotsRef.current.length >= maxCount) return;
    const dataUrl = webcamRef.current?.getScreenshot();
    if (!dataUrl) return;
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
    setShots((s) => [...s, { file, url: URL.createObjectURL(file) }]);
  }, [maxCount]);

  const addFromGallery = (list: FileList | null) => {
    if (!list) return;
    const room = maxCount - shotsRef.current.length;
    if (room <= 0) return;
    const next = Array.from(list)
      .slice(0, room)
      .map((file) => ({ file, url: URL.createObjectURL(file) }));
    setShots((s) => [...s, ...next]);
  };

  const finish = () => {
    onDone(shots.map((s) => s.file));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] text-white">
        <button type="button" onClick={onClose} aria-label="Đóng" className="p-1">
          <X size={26} />
        </button>
        <span className="text-sm font-medium">
          {shots.length}/{maxCount}
        </span>
        {shots.length > 0 ? (
          <button
            type="button"
            onClick={finish}
            className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-black"
          >
            <Check size={16} /> Xong
          </button>
        ) : (
          <span className="w-12" />
        )}
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
            screenshotQuality={0.92}
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

      {/* Bottom controls: Photos · Shutter · Flip front/back */}
      <div className="grid grid-cols-3 items-center px-10 py-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          disabled={full}
          aria-label="Chọn từ thư viện"
          className="justify-self-start disabled:opacity-40"
        >
          {shots.length > 0 ? (
            <img
              src={shots[shots.length - 1].url}
              alt=""
              className="h-12 w-12 rounded-lg object-cover ring-2 ring-white"
            />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/15 text-white">
              <ImageIcon size={24} />
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={capture}
          disabled={full || error}
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
        multiple
        className="hidden"
        onChange={(e) => {
          addFromGallery(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

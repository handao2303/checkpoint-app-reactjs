import { useCallback, useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import { X, SwitchCamera, Image as ImageIcon, Check } from "lucide-react";

type Facing = "user" | "environment";
type Shot = { file: File; url: string };

/**
 * Full-screen in-app camera for check-in photos. Live preview, shutter, flip
 * (front/back), and a Photos button that falls back to the gallery picker.
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
  const [shots, setShots] = useState<Shot[]>([]);
  const [error, setError] = useState(false);

  const shotsRef = useRef(shots);
  shotsRef.current = shots;
  useEffect(() => () => shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url)), []);

  const full = shots.length >= maxCount;

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
            mirrored={facing === "user"}
            videoConstraints={{ facingMode: facing }}
            onUserMediaError={() => setError(true)}
            className="h-full w-full object-cover"
          />
        )}
      </div>

      {/* Bottom controls: Photos · Shutter · Flip */}
      <div className="grid grid-cols-3 items-center px-10 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
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
          onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
          aria-label="Lật camera"
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

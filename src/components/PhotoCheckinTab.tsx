import { Icon } from "./ui/Icon";
import { useRef, useState } from "react";
import { extractGPS } from "../lib/exif";
import { CreateCheckpointForm } from "./CreateCheckpointForm";
import { Button } from "./ui/Button";
import { trackEvent } from "../lib/observability";

type Stage = "idle" | "reading" | "error" | "form";

interface FormReady {
  gps: { lat: number; lng: number };
  file: File;
}

const isValidGPS = (gps: { lat: number; lng: number } | null): gps is { lat: number; lng: number } => {
  return !!gps && !isNaN(gps.lat) && !isNaN(gps.lng) && gps.lat >= -90 && gps.lat <= 90 && gps.lng >= -180 && gps.lng <= 180;
};

export function PhotoCheckinTab({
  onUploaded,
}: {
  onUploaded: () => void;
}) {
  const [stage, setStage] = useState<Stage>("idle");
  const [formData, setFormData] = useState<FormReady | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isAndroid = /android/i.test(navigator.userAgent);

  async function handleFile(file: File) {
    setStage("reading");
    const gps = await extractGPS(file);
    if (!isValidGPS(gps)) {
      setStage("error");
      trackEvent("photo_exif_read_failed");
      return;
    }
    setFormData({ gps, file });
    setStage("form");
    trackEvent("photo_exif_read_success");
  }

  if (stage === "form" && formData) {
    return (
      <div className="flex flex-col gap-4">
        <CreateCheckpointForm
          at={formData.gps}
          initialFiles={[formData.file]}
          onUploaded={onUploaded}
          onReset={() => { setStage("idle"); setFormData(null); }}
          maxImages={1}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 py-6">
      <input
        ref={fileRef}
        type="file"
        // On Android, we omit accept="image/*" to invoke File manager instead of Photo Picker (which strips GPS metadata).
        accept={isAndroid ? undefined : "image/*"}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />

      {(stage === "idle" || stage === "error") && (
        <>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border p-8 text-center transition hover:border-primary/50 hover:bg-surface-muted"
          >
            <Icon name="image-up" size={36} className="text-muted-foreground" />
            <div className="flex flex-col gap-1 w-full">
              <span className="font-semibold">Chọn ảnh có tọa độ GPS</span>
              <span className="text-sm text-muted-foreground">
                Ảnh chụp khi bật vị trí sẽ mang theo tọa độ check-in
              </span>
              {isAndroid && (
                <span className="text-[11px] text-amber-700 bg-amber-500/5 p-2.5 rounded-xl leading-normal border border-amber-500/10 mt-3 text-left block">
                  <strong>Mẹo Android:</strong> Khi chọn ảnh, hãy chọn mục <strong>"Tệp" (Files)</strong> hoặc <strong>"Tệp của bạn"</strong> thay vì chọn trực tiếp từ Album để giữ tọa độ GPS gốc.
                </span>
              )}
            </div>
          </button>

          {stage === "error" && (
            <p className="max-w-xs text-center text-sm text-red-500">
              Ảnh không có thông tin vị trí. Hãy chọn ảnh chụp với GPS bật{isAndroid ? ', chọn qua ứng dụng Tệp' : ''} hoặc dùng tab "Cắm cờ".
            </p>
          )}

          <Button type="button" onClick={() => fileRef.current?.click()}>
            {stage === "error" ? "Thử ảnh khác" : "Chọn ảnh"}
          </Button>
        </>
      )}

      {stage === "reading" && (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
          <span className="text-sm text-muted-foreground">Đang đọc tọa độ từ ảnh…</span>
        </div>
      )}
    </div>
  );
}

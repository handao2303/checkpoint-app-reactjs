import { Icon } from "./ui/Icon";
import { useRef, useState } from "react";
import { extractPhotoMetadata } from "../lib/exif";
import { CreateCheckpointForm } from "./CreateCheckpointForm";
import { Button } from "./ui/Button";
import { trackEvent } from "../lib/observability";
import { t } from "../lib/i18n";

type Stage = "idle" | "reading" | "error" | "form";

interface FormReady {
  gps: { lat: number; lng: number };
  file: File;
  takenAt?: string;
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
    if (!file.type.startsWith("image/")) {
      setStage("error");
      trackEvent("photo_exif_read_failed_invalid_type");
      return;
    }
    setStage("reading");
    const metadata = await extractPhotoMetadata(file);
    const gps = metadata.gps;
    if (!isValidGPS(gps)) {
      setStage("error");
      trackEvent("photo_exif_read_failed");
      return;
    }
    setFormData({ gps, file, takenAt: metadata.takenAt });
    setStage("form");
    trackEvent("photo_exif_read_success");
  }

  if (stage === "form" && formData) {
    return (
      <div className="flex flex-col gap-4">
        <CreateCheckpointForm
          at={formData.gps}
          initialFiles={[formData.file]}
          initialTakenAt={formData.takenAt}
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
        // On Android, we use "image/*,application/pdf" to force the System File Picker (preserving EXIF metadata)
        // while still filtering for images so camera photos show up in the default view.
        accept={isAndroid ? "image/*,application/pdf" : "image/*"}
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
              <span className="font-semibold">{t('chon_anh_co_toa_do_gps')}</span>
              <span className="text-sm text-muted-foreground">
                {t('anh_chup_khi_bat_vi_tri')}
              </span>
              {isAndroid && (
                <span className="text-[11px] text-amber-700 bg-amber-500/5 p-2.5 rounded-xl leading-normal border border-amber-500/10 mt-3 text-left block">
                  <strong>{t('meo_android')}:</strong> {t('photo_android_tip_prefix')} <strong>{t('tep_files')}</strong> {t('photo_android_tip_suffix')}
                </span>
              )}
            </div>
          </button>

          {stage === "error" && (
            <p className="max-w-xs text-center text-sm text-red-500">
              {t('anh_khong_co_thong_tin_vi_tri')}{isAndroid ? t('chon_qua_ung_dung_tep') : ''} {t('hoac_dung_tab_cam_co')}.
            </p>
          )}

          <Button type="button" onClick={() => fileRef.current?.click()}>
            {stage === "error" ? t('thu_anh_khac') : t('chon_anh')}
          </Button>
        </>
      )}

      {stage === "reading" && (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
          <span className="text-sm text-muted-foreground">{t('dang_doc_toa_do_tu_anh')}</span>
        </div>
      )}
    </div>
  );
}

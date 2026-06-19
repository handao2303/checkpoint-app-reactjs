import { t } from "../lib/i18n";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "./ui/Icon";
import { Button } from "./ui/Button";
import { ERR_INSECURE, getCurrentCoords, isGeolocationSecure } from "../lib/geo";
import { getPlatform, isStandalone } from "../lib/platform";
import { trackError, trackEvent } from "../lib/observability";

/** Platform- and install-mode-specific steps to re-enable a blocked location
 *  permission (there is no web API to open these settings programmatically). */
function reenableSteps(): string[] {
  const platform = getPlatform();
  const pwa = isStandalone();

  if (platform === "android") {
    return pwa
      ? [
          t('nhan_giu_bieu_tuong_app'),
          t('chon_thong_tin_ung_dung'),
          t('quyen_vi_tri_cho_phep'),
          t('mo_lai_app_roi_thu'),
        ]
      : [
          t('nhan_bieu_tuong_ben_trai'),
          t('quyen_permissions_vi_tri_location'),
          t('tai_lai_trang'),
        ];
  }
  if (platform === "ios") {
    return pwa
      ? [
          t('mo_cai_dat_iphone'),
          t('vuot_xuong_tim_checkpoint_hoac'),
          t('vi_tri_chon_khi_dung'),
          t('mo_lai_app'),
        ]
      : [
          t('bam_aa_canh_thanh_dia'),
          t('vi_tri_cho_phep_hoac'),
          t('tai_lai_trang'),
        ];
  }
  return pwa
    ? [
        t('bam_bieu_tuong_tren_thanh'),
        t('site_settings_vi_tri_location'),
        t('tai_lai'),
      ]
    : [
        t('bam_bieu_tuong_ben_trai'),
        t('vi_tri_location_cho_phep'),
        t('tai_lai_trang'),
      ];
}

/** Permission explainer + re-enable guidance (presentation-agnostic). Rendered
 *  in a Sheet on the Map, or full-page on the Create tab. */
export function LocationPermissionContent({
  onGranted,
  onCancel,
}: {
  onGranted: (coords: { lat: number; lng: number }) => void;
  onCancel?: () => void;
}) {
  const [state, setState] = useState<PermissionState | "unknown">("unknown");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchPosition = useCallback(() => {
    setBusy(true);
    setError(null);
    // getCurrentCoords records a durable "located before" flag on success, so the
    // app can locate silently on the next launch instead of re-asking (iOS PWAs
    // lose the Permissions API state across relaunches).
    getCurrentCoords().then(
      (coords) => {
        setBusy(false);
        trackEvent("location_granted", { source: "permission_content" });
        onGranted(coords);
      },
      (err: GeolocationPositionError | Error) => {
        setBusy(false);
        // Non-secure origin: iOS won't even show the prompt — explain why.
        if (err instanceof Error && err.message === ERR_INSECURE) {
          setError(t('dinh_vi_can_ket_noi'));
          trackEvent("location_insecure_context");
          return;
        }
        if ("code" in err && err.code === err.PERMISSION_DENIED) {
          setState("denied");
          trackEvent("location_denied", { source: "permission_content" });
        } else {
          setError(t('khong_lay_duoc_vi_tri'));
          trackError(err, { feature: "location", action: "permission_content" }, "warn");
        }
      },
    );
  }, [onGranted]);

  // Track the live permission state so we can auto-continue the moment the user
  // flips it back to "granted" in settings — without them re-tapping.
  useEffect(() => {
    let status: PermissionStatus | null = null;
    let active = true;
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((s) => {
        if (!active) return;
        status = s;
        setState(s.state);
        s.onchange = () => {
          setState(s.state);
          if (s.state === "granted") fetchPosition();
        };
      })
      .catch(() => setState("prompt"));
    return () => {
      active = false;
      if (status) status.onchange = null;
    };
  }, [fetchPosition]);

  const denied = state === "denied";
  const insecure = !isGeolocationSecure();

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 text-primary">
        <Icon name="map-pin" size={32} />
      </span>
      <h2 className="font-display text-lg font-bold">
        {denied ? t('vi_tri_dang_bi_chan') : t('cho_phep_dinh_vi')}
      </h2>

      {denied ? (
        <>
          <p className="text-sm text-muted-foreground">{t('ban_da_chan_quyen_vi')}</p>
          <ol className="w-full list-decimal space-y-1 rounded-xl bg-surface-muted p-3 pl-7 text-left text-sm">
            {reenableSteps().map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <Button className="w-full" disabled={busy} onClick={fetchPosition}>
            {busy ? t('dang_kiem_tra') : t('toi_da_bat_thu_lai')}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {t('checkpoint_can_vi_tri_cua')}
            {t('checkin_nay')}
          </p>
          {insecure && (
            <p className="text-sm text-accent-600">
              {t('trinh_duyet_chi_cho_phep')}
            </p>
          )}
          {error && <p className="text-sm text-accent-600">{error}</p>}
          <Button
            className="w-full"
            disabled={busy || insecure}
            icon={<Icon name="map-pin" size={20} />}
            onClick={fetchPosition}
          >
            {busy ? t('dang_lay_vi_tri') : t('cho_phep_dinh_vi')}
          </Button>
        </>
      )}

      {onCancel && (
        <button onClick={onCancel} className="text-sm text-muted-foreground">
          {t('de_sau')}
        </button>
      )}
    </div>
  );
}

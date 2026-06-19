import { t } from "../lib/i18n";
import type { LatLng } from "../lib/api";
import { useGeocode } from "./useGeocode";

export function useLocationLabel(coords: LatLng | null | undefined) {
  const geo = useGeocode(coords?.lat ?? null, coords?.lng ?? null);
  if (!coords) {
    return {
      locationLabel: t('dang_dung_vi_tri_mac'),
      locationHint: t('bat_vi_tri_de_xem'),
    };
  }

  const placeLabel = geo?.address || geo?.provinceName;
  return {
    locationLabel: placeLabel ?? t('gan_ban'),
    locationHint: placeLabel
      ? t('dia_diem_dang_duoc_sap')
      : t('dang_xac_dinh_khu_vuc'),
  };
}

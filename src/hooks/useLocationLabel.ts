import type { LatLng } from "../lib/api";
import { useGeocode } from "./useGeocode";

export function useLocationLabel(coords: LatLng | null | undefined) {
  const geo = useGeocode(coords?.lat ?? null, coords?.lng ?? null);

  if (!coords) {
    return {
      locationLabel: "Đang dùng vị trí mặc định TP.HCM",
      locationHint: "Bật vị trí để xem các checkpoint quanh bạn chính xác hơn",
    };
  }

  const placeLabel = geo?.address || geo?.provinceName;
  return {
    locationLabel: placeLabel ?? "Gần bạn",
    locationHint: placeLabel
      ? "Địa điểm đang được sắp xếp quanh khu vực này"
      : "Đang xác định khu vực của bạn",
  };
}

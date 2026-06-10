import { Sheet } from "./ui/Sheet";
import { LocationPermissionContent } from "./LocationPermissionContent";

/** Location permission explainer in a bottom sheet (used by the Map check-in). */
export function LocationPermissionSheet({
  onGranted,
  onClose,
}: {
  onGranted: (coords: { lat: number; lng: number }) => void;
  onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose}>
      <LocationPermissionContent onGranted={onGranted} onCancel={onClose} />
    </Sheet>
  );
}

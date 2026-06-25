import { useTranslation } from "react-i18next";
import { Sheet } from "./ui/Sheet";
import { CreateCheckpointForm } from "./CreateCheckpointForm";

/** The check-in form in a bottom sheet (used by the Map CHECK-IN button). */
export function CreateCheckpointSheet({
  at,
  onClose,
}: {
  at: { lat: number; lng: number };
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Sheet title={t('cam_co_tai_day')} onClose={onClose}>
      <CreateCheckpointForm at={at} onUploaded={onClose} />
    </Sheet>
  );
}

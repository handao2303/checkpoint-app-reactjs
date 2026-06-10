import { Sheet } from "./ui/Sheet";
import { CreateCheckpointForm } from "./CreateCheckpointForm";

/** The check-in form in a bottom sheet (used by the Map CHECK-IN button). */
export function CreateCheckpointSheet({
  at,
  onClose,
  onCreated,
}: {
  at: { lat: number; lng: number };
  onClose: () => void;
  onCreated: (xp: number) => void;
}) {
  return (
    <Sheet title="Cắm cờ tại đây" onClose={onClose}>
      <CreateCheckpointForm at={at} onCreated={onCreated} />
    </Sheet>
  );
}

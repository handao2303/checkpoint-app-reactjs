import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { deleteCheckpoint, getMe } from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/ui/Button";

/**
 * Shared hard-delete flow for a checkpoint (used by the detail sheet and the
 * Discover feed cards). Owns the 2-step confirm state + UI and the cache
 * fallout: invalidates everything the delete touches server-side (feed, map,
 * passport, journeys) and refreshes the cached user (XP is taken back).
 *
 * Callers render their own trigger (icon / text button) calling `requestDelete`,
 * and place `confirmBox` wherever the confirmation should appear. Ownership is
 * checked by the caller (and enforced server-side regardless).
 */
export function useDeleteCheckpoint(
  id: string,
  { onDeleted }: { onDeleted?: () => void } = {},
) {
  const qc = useQueryClient();
  const { applyUser } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteCheckpoint(id);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["checkpoints"] }),
        qc.invalidateQueries({ queryKey: ["feed"] }),
        qc.invalidateQueries({ queryKey: ["passport"] }),
        qc.invalidateQueries({ queryKey: ["journey"] }),
        qc.invalidateQueries({ queryKey: ["journeys"] }),
      ]);
      // XP/level/counters changed server-side — refresh the cached user too.
      getMe().then(applyUser).catch(() => {});
      onDeleted?.();
    } catch {
      setError("Không xóa được. Vui lòng thử lại.");
      setDeleting(false);
    }
  };

  const confirmBox: ReactNode = confirming ? (
    <div className="flex flex-col gap-2 rounded-xl bg-accent-50 p-3">
      <p className="text-sm text-accent-700">
        Xóa vĩnh viễn check-in này? Ảnh sẽ bị xóa và XP đã nhận sẽ bị trừ lại.
      </p>
      {error && <p className="text-sm font-medium text-accent-700">{error}</p>}
      <div className="flex gap-2">
        <Button variant="accent" className="flex-1" disabled={deleting} onClick={confirmDelete}>
          {deleting ? "Đang xóa..." : "Xóa vĩnh viễn"}
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          disabled={deleting}
          onClick={() => setConfirming(false)}
        >
          Hủy
        </Button>
      </div>
    </div>
  ) : null;

  return { requestDelete: () => setConfirming(true), confirming, confirmBox };
}

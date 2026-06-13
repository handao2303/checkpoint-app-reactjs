// Processes POST /checkpoints in the background after R2 uploads complete.
// Lives at app root so it survives form unmounts. Fires XP/badge toasts on
// success, error toast on failure.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createCheckpoint, type Badge, type CheckinInput } from "../lib/api";
import { Toast } from "../components/ui/Toast";
import { BadgeUnlockToast } from "../components/BadgeUnlockToast";

interface CheckinQueueCtx {
  enqueue: (input: CheckinInput) => void;
}

const Ctx = createContext<CheckinQueueCtx | null>(null);

export function useCheckinQueue() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCheckinQueue must be inside CheckinQueueProvider");
  return ctx;
}

export function CheckinQueueProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [queue, setQueue] = useState<CheckinInput[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const processing = useRef(false);

  const enqueue = useCallback((input: CheckinInput) => {
    setQueue((q) => [...q, input]);
  }, []);

  useEffect(() => {
    if (queue.length === 0 || processing.current) return;

    const item = queue[0];
    processing.current = true;

    createCheckpoint(item)
      .then((res) => {
        void Promise.all([
          qc.invalidateQueries({ queryKey: ["checkpoints"] }),
          qc.invalidateQueries({ queryKey: ["feed"] }),
          qc.invalidateQueries({ queryKey: ["place"] }),
          qc.invalidateQueries({ queryKey: ["passport"] }),
          qc.invalidateQueries({ queryKey: ["badges"] }),
        ]);
        setToast(`+${res.xp_awarded} XP 🎉`);
        if (res.new_badges?.length) setBadges(res.new_badges);
      })
      .catch(() => {
        setToast("Lưu check-in thất bại. Vui lòng thử lại.");
      })
      .finally(() => {
        processing.current = false;
        setQueue((q) => q.slice(1));
      });
  }, [queue, qc]);

  return (
    <Ctx.Provider value={{ enqueue }}>
      {children}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      {badges.length > 0 && <BadgeUnlockToast badges={badges} onDone={() => setBadges([])} />}
    </Ctx.Provider>
  );
}

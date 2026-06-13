// Processes POST /checkpoints in the background after R2 uploads complete.
// Lives at app root so it survives form unmounts. Jobs are persisted to
// localStorage so they survive app kills — recovered and retried on next open.
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
import { createCheckpoint, ApiError, type Badge, type CheckinInput } from "../lib/api";
import { Toast } from "../components/ui/Toast";
import { BadgeUnlockToast } from "../components/BadgeUnlockToast";

// ---- persistence ----------------------------------------------------------

interface PendingJob {
  id: string;
  input: CheckinInput;
  enqueuedAt: number;
}

const LS_KEY = "cp_checkin_queue";

function loadJobs(): PendingJob[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as PendingJob[];
  } catch {
    return [];
  }
}

function saveJob(job: PendingJob): void {
  try {
    const jobs = loadJobs().filter((j) => j.id !== job.id);
    localStorage.setItem(LS_KEY, JSON.stringify([...jobs, job]));
  } catch {
    // localStorage full or unavailable — proceed without persistence
  }
}

function removeJob(id: string): void {
  try {
    const jobs = loadJobs().filter((j) => j.id !== id);
    localStorage.setItem(LS_KEY, JSON.stringify(jobs));
  } catch {
    // ignore
  }
}

// ---- retry ----------------------------------------------------------------

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [0, 2000, 5000];

function isRetryable(err: unknown): boolean {
  if (err instanceof ApiError) return err.status >= 500;
  return true; // network error (fetch threw, no status)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- context --------------------------------------------------------------

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
  // Seed queue from localStorage on first render so pending jobs from a
  // previous session are recovered automatically.
  const [queue, setQueue] = useState<PendingJob[]>(() => loadJobs());
  const [toast, setToast] = useState<string | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const processing = useRef(false);

  const enqueue = useCallback((input: CheckinInput) => {
    const job: PendingJob = {
      id: crypto.randomUUID(),
      input,
      enqueuedAt: Date.now(),
    };
    saveJob(job);
    setQueue((q) => [...q, job]);
  }, []);

  useEffect(() => {
    if (queue.length === 0 || processing.current) return;

    const job = queue[0];
    processing.current = true;

    async function run() {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt]);

        try {
          const res = await createCheckpoint(job.input);

          removeJob(job.id);
          void Promise.all([
            qc.invalidateQueries({ queryKey: ["checkpoints"] }),
            qc.invalidateQueries({ queryKey: ["feed"] }),
            qc.invalidateQueries({ queryKey: ["place"] }),
            qc.invalidateQueries({ queryKey: ["passport"] }),
            qc.invalidateQueries({ queryKey: ["badges"] }),
          ]);
          setToast(`+${res.xp_awarded} XP 🎉`);
          if (res.new_badges?.length) setBadges(res.new_badges);
          break;
        } catch (err) {
          const retry = isRetryable(err) && attempt < MAX_ATTEMPTS - 1;
          if (!retry) {
            removeJob(job.id);
            setToast("Lưu check-in thất bại. Vui lòng thử lại.");
            break;
          }
        }
      }

      processing.current = false;
      setQueue((q) => q.slice(1));
    }

    void run();
  }, [queue, qc]);

  return (
    <Ctx.Provider value={{ enqueue }}>
      {children}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      {badges.length > 0 && <BadgeUnlockToast badges={badges} onDone={() => setBadges([])} />}
    </Ctx.Provider>
  );
}

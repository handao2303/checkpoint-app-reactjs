import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, Image as ImageIcon, X, Camera, Luggage } from "lucide-react";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import { createCheckpoint, getMyJourneys, uploadCheckpointImages, type Badge } from "../lib/api";
import { prepareImage } from "../lib/image";
import { CATEGORIES } from "../lib/maps";
import { Button } from "./ui/Button";
import { cn } from "../lib/cn";
import { quickCheckinSettings } from "../lib/settings";

interface PickedImage {
  file: File;
  url: string;
}

const MAX_IMAGES = 3;

/** Native HTML capture is useful on touch devices; desktop keeps the picker. */
function canUseNativeCamera(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

/** The check-in form (presentation-agnostic). Rendered inside a Sheet on the
 *  Map, or full-page on the Create tab. */
export interface CheckinPlace {
  id: string;
  name: string;
  category: string;
}

export function CreateCheckpointForm({
  at,
  place,
  onCreated,
}: {
  at: { lat: number; lng: number };
  /** When set, check-in is to an existing place: name is fixed and place_id sent. */
  place?: CheckinPlace;
  onCreated: (xp: number, newBadges: Badge[]) => void;
}) {
  const qc = useQueryClient();
  // The server auto-attaches the user's active journey to a check-in, so surface
  // which journey this check-in will be recorded under.
  const { data: journeys = [] } = useQuery({ queryKey: ["journeys"], queryFn: getMyJourneys });
  const activeJourney = journeys.find((j) => j.is_active);
  const [name, setName] = useState(place?.name ?? "");
  const [category, setCategory] = useState(place?.category ?? "cafe");
  const [note, setNote] = useState("");
  const [rating, setRating] = useState<number | undefined>(undefined);
  const [picked, setPicked] = useState<PickedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const nativeCamera = canUseNativeCamera();
  const showQuickCamera =
    quickCheckinSettings.preferCameraOnCheckin && nativeCamera && picked.length === 0;

  // Revoke object URLs on unmount (read latest via ref to avoid stale closure).
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  useEffect(() => () => pickedRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  // Convert HEIC + downscale so uploads are always a modest JPEG. Shared by the
  // gallery picker and native camera capture.
  async function addFileArray(files: File[]) {
    const remainingSlots = MAX_IMAGES - pickedRef.current.length;
    if (remainingSlots <= 0 || files.length === 0) return;

    setProcessing(true);
    setErr(null);
    try {
      const prepared = await Promise.all(files.slice(0, remainingSlots).map(prepareImage));
      setPicked((prev) => [
        ...prev,
        ...prepared.map((file) => ({ file, url: URL.createObjectURL(file) })),
      ]);
    } catch (e) {
      console.error("image prepare failed:", e);
      setErr("Không xử lý được ảnh. Vui lòng thử ảnh khác.");
    } finally {
      setProcessing(false);
    }
  }

  function removeAt(index: number) {
    setPicked((prev) => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);

    // Step 1 — create the check-in. Only THIS failing means "try again".
    let res;
    try {
      res = await createCheckpoint({
        name,
        category,
        note: note || undefined,
        rating,
        lat: at.lat,
        lng: at.lng,
        place_id: place?.id,
      });
    } catch {
      setErr("Không tạo được check-in. Vui lòng thử lại.");
      setBusy(false);
      return;
    }

    // Step 2 — attach photos (best-effort). The check-in is already saved, so a
    // failure here must NOT report total failure or invite a duplicate retry.
    if (picked.length) {
      try {
        await uploadCheckpointImages(res.checkpoint.id, picked.map((p) => p.file));
      } catch (uploadErr) {
        console.error("image upload failed (check-in still saved):", uploadErr);
      }
    }

    await Promise.all([
      qc.invalidateQueries({ queryKey: ["checkpoints"] }),
      qc.invalidateQueries({ queryKey: ["feed"] }),
      qc.invalidateQueries({ queryKey: ["place"] }),
      qc.invalidateQueries({ queryKey: ["passport"] }),
      qc.invalidateQueries({ queryKey: ["badges"] }),
    ]);
    onCreated(res.xp_awarded, res.new_badges ?? []);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {activeJourney && (
        <div className="flex items-center gap-2 rounded-xl bg-secondary/10 px-3 py-2 text-sm text-secondary">
          <Luggage size={18} className="shrink-0" />
          <span>
            Đang ghi cho hành trình <b>“{activeJourney.title}”</b>
          </span>
        </div>
      )}

      {showQuickCamera && (
        <Button
          type="button"
          size="lg"
          icon={<Camera size={22} />}
          disabled={processing}
          onClick={() => cameraRef.current?.click()}
        >
          {processing ? "Đang xử lý..." : "Chụp ảnh ngay"}
        </Button>
      )}

      <input
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        readOnly={!!place}
        placeholder="Tên địa điểm"
        className="rounded-full border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring read-only:opacity-70"
      />

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCategory(c.key)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium",
              category === c.key ? "bg-primary text-primary-foreground" : "bg-surface-muted text-muted-foreground",
            )}
          >
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      <textarea
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Cảm nhận của bạn..."
        className="resize-none rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />

      <div className="flex items-center gap-1">
        <span className="mr-1 text-sm text-muted-foreground">Đánh giá</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n === rating ? undefined : n)}
            className={cn("text-2xl", rating && n <= rating ? "opacity-100" : "opacity-30")}
            aria-label={`${n} sao`}
          >
            ⭐
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <PhotoProvider>
          {picked.map((p, i) => (
            <div key={p.url} className="relative h-20 w-20">
              <PhotoView src={p.url}>
                <img src={p.url} alt="" className="h-20 w-20 cursor-zoom-in rounded-lg object-cover" />
              </PhotoView>
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent-500 text-white shadow"
                aria-label="Xóa ảnh"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </PhotoProvider>
        {picked.length < MAX_IMAGES && (
          <>
            {nativeCamera && !showQuickCamera && (
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                disabled={processing}
                className={cn(
                  "flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-primary text-primary",
                  processing ? "cursor-wait opacity-60" : "cursor-pointer",
                )}
              >
                <Camera size={22} />
                <span className="text-xs font-medium">Chụp ảnh</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={processing}
              className={cn(
                "flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-muted-foreground",
                processing ? "cursor-wait opacity-60" : "cursor-pointer",
              )}
            >
              {processing ? (
                <span className="text-xs">Đang xử lý…</span>
              ) : (
                <>
                  <ImageIcon size={22} />
                  <span className="text-xs font-medium">{nativeCamera ? "Thư viện" : "Chọn ảnh"}</span>
                </>
              )}
            </button>
          </>
        )}
        {/* Native camera capture: browsers may still choose to show a picker. */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            void addFileArray(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        {/* Gallery/file picker, separate so camera capture does not show its chooser. */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          className="hidden"
          onChange={(e) => {
            void addFileArray(Array.from(e.target.files ?? []));
            e.target.value = ""; // allow re-picking the same file
          }}
        />
      </div>

      {err && <p className="text-sm text-accent-600">{err}</p>}

      <Button type="submit" variant="accent" disabled={busy || processing} icon={<Flag size={20} />}>
        {busy ? "Đang lưu..." : "CẮM CỜ"}
      </Button>
    </form>
  );
}

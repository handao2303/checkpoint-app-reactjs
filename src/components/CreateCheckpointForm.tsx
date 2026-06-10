import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Flag, Plus, X } from "lucide-react";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import { createCheckpoint, uploadCheckpointImages } from "../lib/api";
import { CATEGORIES } from "../lib/maps";
import { Button } from "./ui/Button";
import { cn } from "../lib/cn";

interface PickedImage {
  file: File;
  url: string;
}

const MAX_IMAGES = 3;

/** The check-in form (presentation-agnostic). Rendered inside a Sheet on the
 *  Map, or full-page on the Create tab. */
export function CreateCheckpointForm({
  at,
  onCreated,
}: {
  at: { lat: number; lng: number };
  onCreated: (xp: number) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("cafe");
  const [note, setNote] = useState("");
  const [rating, setRating] = useState<number | undefined>(undefined);
  const [picked, setPicked] = useState<PickedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Revoke object URLs on unmount (read latest via ref to avoid stale closure).
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  useEffect(() => () => pickedRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setPicked((prev) => {
      const remainingSlots = MAX_IMAGES - prev.length;
      if (remainingSlots <= 0) return prev;

      const next = Array.from(list)
        .slice(0, remainingSlots)
        .map((file) => ({ file, url: URL.createObjectURL(file) }));

      return [...prev, ...next];
    });
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
    try {
      const res = await createCheckpoint({
        name,
        category,
        note: note || undefined,
        rating,
        lat: at.lat,
        lng: at.lng,
      });
      if (picked.length) await uploadCheckpointImages(res.checkpoint.id, picked.map((p) => p.file));
      await qc.invalidateQueries({ queryKey: ["checkpoints"] });
      onCreated(res.xp_awarded);
    } catch {
      setErr("Không tạo được check-in. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <input
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tên địa điểm"
        className="rounded-full border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
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
          <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground">
            <Plus size={24} />
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = ""; // allow re-picking the same file
              }}
            />
          </label>
        )}
      </div>

      {err && <p className="text-sm text-accent-600">{err}</p>}

      <Button type="submit" variant="accent" disabled={busy} icon={<Flag size={20} />}>
        {busy ? "Đang lưu..." : "CẮM CỜ"}
      </Button>
    </form>
  );
}

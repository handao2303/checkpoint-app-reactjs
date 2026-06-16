import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "./ui/Icon";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import { getMyJourneys, getNearbyPlaces, getUploadSlots, putFilesToSlots } from "../lib/api";
import { useCheckinQueue } from "../context/CheckinQueue";
import { useGeocode } from "../hooks/useGeocode";
import { prepareCheckpointImage } from "../lib/image";
import { CATEGORIES } from "../lib/maps";
import { Button } from "./ui/Button";
import { cn } from "../lib/cn";
import { quickCheckinSettings } from "../lib/settings";
import { CameraCaptureSheet } from "./CameraCaptureSheet";
import { trackError, trackEvent } from "../lib/observability";

interface PickedImage {
  original: File;
  thumbnail: File;
  url: string;
  thumbnailUrl: string;
}

const MAX_IMAGES = 3;

/** Prefer the in-app camera on touch devices with a usable camera + secure
 *  context; desktop keeps the plain file picker. */
function canUseCamera(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    window.isSecureContext &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

function isPhonePwa(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
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
  initialFiles,
  onUploaded,
  onReset,
  maxImages = MAX_IMAGES,
}: {
  at: { lat: number; lng: number };
  /** When set, check-in is to an existing place: name is fixed and place_id sent. */
  place?: CheckinPlace;
  /** Pre-load these files into the image picker on mount (photo check-in flow). */
  initialFiles?: File[];
  onUploaded: () => void;
  /** Called when all images are removed (e.g. photo check-in flow → back to picker). */
  onReset?: () => void;
  maxImages?: number;
}) {
  const { enqueue } = useCheckinQueue();
  // Pick which active journey this check-in is recorded under (multiple can be
  // active). Default to the most recently activated one until the user changes.
  const { data: journeys = [] } = useQuery({ queryKey: ["journeys"], queryFn: getMyJourneys });
  const activeJourneys = journeys
    .filter((j) => j.is_active)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const [journeyId, setJourneyId] = useState<string | null | undefined>(undefined);
  const effectiveJourneyId = journeyId === undefined ? (activeJourneys[0]?.id ?? null) : journeyId;
  const [name, setName] = useState(place?.name ?? "");
  const [category, setCategory] = useState(place?.category ?? "cafe");
  const [suggestionApplied, setSuggestionApplied] = useState(false);
  const [note, setNote] = useState("");
  const [rating, setRating] = useState<number | undefined>(undefined);
  const [picked, setPicked] = useState<PickedImage[]>([]);
  const geo = useGeocode(at.lat, at.lng);
  const { data: placeSuggestions = [], isFetched: placeSuggestionsFetched } = useQuery({
    queryKey: ["places-suggest", at.lat, at.lng],
    queryFn: () => getNearbyPlaces(at.lat, at.lng),
    staleTime: 60 * 60 * 1000,
    retry: false,
    enabled: !place, // skip for existing-place check-ins
  });
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraAvailable = canUseCamera();
  const phonePwa = isPhonePwa();
  const usePwaCamera = phonePwa && cameraAvailable;
  const autoCameraAttempted = useRef(false);

  // Revoke object URLs on unmount (read latest via ref to avoid stale closure).
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  useEffect(
    () => () =>
      pickedRef.current.forEach((p) => {
        URL.revokeObjectURL(p.url);
        URL.revokeObjectURL(p.thumbnailUrl);
      }),
    [],
  );

  // When all images are removed after having had some (photo check-in), call onReset.
  const prevPickedLen = useRef(0);
  useEffect(() => {
    const prev = prevPickedLen.current;
    prevPickedLen.current = picked?.length;
    if (picked?.length === 0 && prev > 0) onReset?.();
  }, [picked?.length, onReset]);

  // Prefer the top Places suggestion; only fall back to Photon after the Places
  // request has completed without a usable result.
  const autoFillResolved = useRef(false);
  useEffect(() => {
    if (autoFillResolved.current || place || !placeSuggestionsFetched) return;

    const top = placeSuggestions.find((s) => s.name?.trim());
    if (top) {
      autoFillResolved.current = true;
      if (name) return;
      setName(top.name.trim());
      setSuggestionApplied(true);
      setCategory(top.category || "other");
      return;
    }

    if (!geo) return;
    const suggestion = geo.address.split(",")[0].trim();
    if (!suggestion) return;
    autoFillResolved.current = true;
    if (!name) setName(suggestion);
  }, [geo, name, place, placeSuggestions, placeSuggestionsFetched]);

  useEffect(() => {
    if (
      !autoCameraAttempted.current &&
      usePwaCamera &&
      !initialFiles?.length &&
      quickCheckinSettings.preferCameraOnCheckin
    ) {
      autoCameraAttempted.current = true;
      setCameraOpen(true);
    }
  }, [usePwaCamera, initialFiles?.length]);

  // Seed the image picker with pre-loaded files (photo check-in flow). Runs
  // once on mount via a ref so the effect doesn't re-run if the parent rerenders.
  const initialFilesRef = useRef(initialFiles);
  useEffect(() => {
    if (initialFilesRef.current?.length) addFileArray(initialFilesRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Convert HEIC + downscale so uploads are always a modest JPEG. Shared by the
  // file picker and the in-app camera.
  async function addFileArray(files: File[]) {
    const remainingSlots = maxImages - pickedRef.current?.length;
    if (remainingSlots <= 0 || files?.length === 0) return;

    setProcessing(true);
    setErr(null);
    try {
      const prepared = await Promise.all(files.slice(0, remainingSlots).map(prepareCheckpointImage));
      setPicked((prev) => [
        ...prev,
        ...prepared.map(({ original, thumbnail }) => ({
          original,
          thumbnail,
          url: URL.createObjectURL(original),
          thumbnailUrl: URL.createObjectURL(thumbnail),
        })),
      ]);
      trackEvent("image_prepare_success", { image_count: prepared.length });
    } catch (e) {
      console.error("image prepare failed:", e);
      trackError(e, { feature: "checkin", action: "image_prepare" });
      trackEvent("image_prepare_failed");
      setErr("Không xử lý được ảnh. Vui lòng thử ảnh khác.");
    } finally {
      setProcessing(false);
    }
  }

  const addPhotos = () => {
    if (usePwaCamera) setCameraOpen(true);
    else fileRef.current?.click();
  };

  function removeAt(index: number) {
    setPicked((prev) => {
      URL.revokeObjectURL(prev[index].url);
      URL.revokeObjectURL(prev[index].thumbnailUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!picked?.length) {
      setErr("Bắt buộc phải có ít nhất 1 ảnh.");
      return;
    }
    setBusy(true);
    setErr(null);

    // Step 1 — get presigned slots (before checkpoint exists).
    let slots;
    try {
      slots = await getUploadSlots(picked?.length);
      trackEvent("upload_slots_success", { image_count: picked.length });
    } catch {
      trackEvent("upload_slots_failed", { image_count: picked.length });
      setErr("Không lấy được link upload. Vui lòng thử lại.");
      setBusy(false);
      return;
    }

    // Step 2 — upload directly to R2. Fails fast if any PUT fails.
    try {
      await putFilesToSlots(slots, picked.map((p) => ({ original: p.original, thumbnail: p.thumbnail })));
      trackEvent("r2_upload_success", { image_count: picked.length });
    } catch {
      trackEvent("r2_upload_failed", { image_count: picked.length });
      setErr("Upload ảnh thất bại. Vui lòng thử lại.");
      setBusy(false);
      return;
    }

    // Step 3 — enqueue the POST in the background and return immediately.
    enqueue({
      name,
      category,
      note: note || undefined,
      rating,
      lat: at.lat,
      lng: at.lng,
      address: geo?.address,
      province: geo?.provinceName,
      province_code: geo?.province,
      place_id: place?.id,
      journey_id: effectiveJourneyId ?? undefined,
      images: slots.map((s) => ({ object_key: s.object_key, thumbnail_key: s.thumbnail_key })),
    });
    onUploaded();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {activeJourneys?.length > 0 && (
        <label className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-secondary">
            <Icon name="luggage" size={16} /> Ghi vào hành trình
          </span>
          <select
            value={effectiveJourneyId ?? ""}
            onChange={(e) => setJourneyId(e.target.value || null)}
            className="rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Không gắn hành trình</option>
            {activeJourneys.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex flex-col gap-1">
        <input
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (suggestionApplied) setSuggestionApplied(false);
          }}
          readOnly={!!place}
          placeholder="Tên địa điểm"
          className="rounded-full border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring read-only:opacity-70"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCategory(c.key)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium",
              category === c.key ? "bg-primary text-primary-foreground" : "bg-surface-muted text-muted-foreground",
            )}
          >
            <Icon name={c.icon} size={16} /> {c.label}
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
            className={cn(rating && n <= rating ? "opacity-100" : "opacity-30")}
            aria-label={`${n} sao`}
          >
            <Icon name="star" size={28} className="fill-gold text-gold" />
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <PhotoProvider>
          {picked.map((p, i) => (
            <div key={p.url} className="relative h-20 w-20">
              <PhotoView src={p.url}>
                <img src={p.thumbnailUrl} alt="" className="h-20 w-20 cursor-zoom-in rounded-lg object-cover" />
              </PhotoView>
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent-500 text-white shadow"
                aria-label="Xóa ảnh"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </PhotoProvider>
        {picked?.length < maxImages && (
          <button
            type="button"
            onClick={addPhotos}
            disabled={processing}
            className={cn(
              "flex h-20 w-20 flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed border-border text-muted-foreground",
              processing ? "cursor-wait opacity-60" : "cursor-pointer",
            )}
          >
            {processing ? (
              <span className="text-xs">Đang xử lý…</span>
            ) : usePwaCamera ? (
              <Icon name="camera" size={24} />
            ) : (
              <>
                <Icon name="image" size={22} />
                <span className="text-xs font-medium">Chọn ảnh</span>
              </>
            )}
          </button>
        )}
        {/* Hidden picker — used directly on desktop / camera-unavailable. */}
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

      <Button type="submit" variant="accent" disabled={busy || processing || !picked?.length} icon={<Icon name="flag" size={20} />}>
        {busy ? "Đang lưu..." : "CẮM CỜ"}
      </Button>
      {cameraOpen && (
        <CameraCaptureSheet
          maxCount={maxImages - picked?.length}
          onClose={() => setCameraOpen(false)}
          onDone={(files) => void addFileArray(files)}
        />
      )}
    </form>
  );
}

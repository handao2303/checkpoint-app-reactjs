import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useCheckinQueue } from "../context/CheckinQueue";
import { useGeocode } from "../hooks/useGeocode";
import {
  getMyJourneys,
  getNearbyPlaces,
  getUploadSlots,
  putFilesToSlots,
  getNearbyAppPlaces,
  type UploadMediaType,
  type UploadSlot,
} from "../lib/api";
import { cn } from "../lib/cn";
import { prepareCheckpointImage } from "../lib/image";
import { CATEGORIES } from "../lib/maps";
import { trackError, trackEvent } from "../lib/observability";
import { quickCheckinSettings } from "../lib/settings";
import { prepareCheckpointVideo } from "../lib/video";
import { CameraCaptureSheet } from "./CameraCaptureSheet";
import { MediaPreview } from "./MediaPreview";
import { Button } from "./ui/Button";
import { Icon } from "./ui/Icon";

interface PickedMedia {
  type: UploadMediaType;
  original: File;
  thumbnail: File;
  url: string;
  thumbnailUrl: string;
}

const MAX_IMAGES = 3;
const MAX_VIDEOS = 1;

function isProbablyVideoFile(file: File): boolean {
  return file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv|avi|3gp|3gpp)$/i.test(file.name);
}

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

function getHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
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

  const [selectedPlace, setSelectedPlace] = useState<CheckinPlace | null>(place ?? null);
  const [viewMode, setViewMode] = useState<"select-place" | "fill-form">("fill-form");
  const [hasInitializedView, setHasInitializedView] = useState(false);

  const [name, setName] = useState(place?.name ?? "");
  const [category, setCategory] = useState(place?.category ?? "cafe");
  const [suggestionApplied, setSuggestionApplied] = useState(false);
  const [note, setNote] = useState("");
  const [rating, setRating] = useState<number | undefined>(undefined);
  const [picked, setPicked] = useState<PickedMedia[]>([]);
  const geo = useGeocode(at.lat, at.lng);

  const { data: nearbyAppPlacesData, isFetched: nearbyAppPlacesFetched } = useQuery({
    queryKey: ["places-nearby-app", at.lat, at.lng],
    queryFn: () => getNearbyAppPlaces(at, { limit: 50 }),
    staleTime: 5 * 60 * 1000,
    retry: false,
    enabled: !place,
  });
  const nearbyAppPlaces = nearbyAppPlacesData?.places ?? [];

  const matchingPlaces = nearbyAppPlaces
    .map((p) => ({
      ...p,
      distance: getHaversineDistance(at.lat, at.lng, p.lat, p.lng),
    }))
    .filter((p) => p.distance <= 50)
    .sort((a, b) => a.distance - b.distance);

  useEffect(() => {
    if (place || hasInitializedView || !nearbyAppPlacesFetched) return;
    if (matchingPlaces.length > 0) {
      setViewMode("select-place");
    }
    setHasInitializedView(true);
  }, [place, matchingPlaces.length, nearbyAppPlacesFetched, hasInitializedView]);

  const handleSelectPlace = (p: CheckinPlace) => {
    setSelectedPlace(p);
    setName(p.name);
    setCategory(p.category);
    setViewMode("fill-form");
  };

  const handleCreateNewPlace = () => {
    setSelectedPlace(null);
    const top = placeSuggestions.find((s) => s.name?.trim());
    if (top) {
      setName(top.name.trim());
      setCategory(top.category || "other");
    } else if (geo) {
      const suggestion = geo.address.split(",")[0].trim();
      setName(suggestion || "");
      setCategory("other");
    } else {
      setName("");
      setCategory("cafe");
      autoFillResolved.current = false;
    }
    setViewMode("fill-form");
  };

  const { data: placeSuggestions = [], isFetched: placeSuggestionsFetched } = useQuery({
    queryKey: ["places-suggest", at.lat, at.lng],
    queryFn: () => getNearbyPlaces(at.lat, at.lng),
    staleTime: 60 * 60 * 1000,
    retry: false,
    enabled: !place && !selectedPlace, // skip for existing-place check-ins
  });
  const [busy, setBusy] = useState(false);
  const [imageProcessing, setImageProcessing] = useState(false);
  const [videoProcessing, setVideoProcessing] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const imageFileRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);
  const cameraAvailable = canUseCamera();
  const phonePwa = isPhonePwa();
  const usePwaCamera = phonePwa && cameraAvailable;
  const autoCameraAttempted = useRef(false);

  // Revoke object URLs on unmount (read latest via ref to avoid stale closure).
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  const imageCount = picked.filter((p) => p.type === "image").length;
  // const videoCount = picked.filter((p) => p.type === "video").length;
  const processing = imageProcessing || videoProcessing;
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
    prevPickedLen.current = picked.length;
    if (picked.length === 0 && prev > 0) onReset?.();
  }, [picked.length, onReset]);

  // Prefer the top Places suggestion; only fall back to Photon after the Places
  // request has completed without a usable result.
  const autoFillResolved = useRef(false);
  useEffect(() => {
    if (autoFillResolved.current || place || selectedPlace || !placeSuggestionsFetched) return;

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
    if (files.length === 0) return;

    const hasVideo = files.some(isProbablyVideoFile);
    const hasImage = files.some((file) => !isProbablyVideoFile(file));
    if (hasImage) setImageProcessing(true);
    if (hasVideo) setVideoProcessing(true);
    setErr(null);
    try {
      let nextImageCount = pickedRef.current.filter((p) => p.type === "image").length;
      let nextVideoCount = pickedRef.current.filter((p) => p.type === "video").length;
      const prepared: PickedMedia[] = [];
      for (const file of files) {
        const isVideo = isProbablyVideoFile(file);
        if (isVideo) {
          if (nextVideoCount >= MAX_VIDEOS) {
            setErr("Tối đa 1 video/check-in.");
            continue;
          }
          const { original, thumbnail } = await prepareCheckpointVideo(file);
          prepared.push({
            type: "video",
            original,
            thumbnail,
            url: URL.createObjectURL(original),
            thumbnailUrl: URL.createObjectURL(thumbnail),
          });
          nextVideoCount += 1;
          continue;
        }

        if (nextImageCount >= maxImages) {
          setErr(`Tối đa ${maxImages} ảnh/check-in.`);
          continue;
        }
        const { original, thumbnail } = await prepareCheckpointImage(file);
        prepared.push({
          type: "image",
          original,
          thumbnail,
          url: URL.createObjectURL(original),
          thumbnailUrl: URL.createObjectURL(thumbnail),
        });
        nextImageCount += 1;
      }
      if (prepared.length > 0) {
        setPicked((prev) => [...prev, ...prepared]);
      }
      trackEvent("media_prepare_success", { media_count: prepared.length });
    } catch (e) {
      console.error("media prepare failed:", e);
      trackError(e, { feature: "checkin", action: "media_prepare" });
      trackEvent("media_prepare_failed");
      setErr(e instanceof Error ? e.message : "Không xử lý được media. Vui lòng thử file khác.");
    } finally {
      if (hasImage) setImageProcessing(false);
      if (hasVideo) setVideoProcessing(false);
    }
  }

  const addPhotos = () => {
    if (usePwaCamera) setCameraOpen(true);
    else imageFileRef.current?.click();
  };

  // const addVideo = () => {
  //   videoFileRef.current?.click();
  // };

  function removeAt(index: number) {
    setPicked((prev) => {
      URL.revokeObjectURL(prev[index].url);
      URL.revokeObjectURL(prev[index].thumbnailUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (picked.length === 0) {
      setErr("Bắt buộc phải có ít nhất 1 ảnh hoặc video.");
      return;
    }
    setBusy(true);
    setErr(null);

    // Step 1 — presigned slots for all media (images + the raw video).
    let slots: UploadSlot[];
    const mediaTypes = picked.map((p) => p.type);
    try {
      slots = await getUploadSlots(mediaTypes);
      trackEvent("upload_slots_success", { media_count: mediaTypes.length });
    } catch {
      trackEvent("upload_slots_failed", { media_count: mediaTypes.length });
      setErr("Không lấy được link upload. Vui lòng thử lại.");
      setBusy(false);
      return;
    }

    // Step 2 — upload raw media directly to R2. Images also upload their
    // thumbnail; the video uploads only the raw file — the backend worker
    // transcodes it to MP4 and cuts its thumbnail.
    try {
      await putFilesToSlots(
        slots,
        picked.map((p) => ({ original: p.original, thumbnail: p.thumbnail, type: p.type })),
      );
      trackEvent("r2_upload_success", { media_count: picked.length });
    } catch {
      trackEvent("r2_upload_failed", { media_count: picked.length });
      setErr("Upload ảnh/video thất bại. Vui lòng thử lại.");
      setBusy(false);
      return;
    }

    // Step 3 — enqueue the POST in the background and return immediately. The
    // video omits thumbnail_key, so the backend marks it pending and the worker
    // processes it asynchronously.
    try {
      const images = slots.map((s, i) =>
        picked[i].type === "video"
          ? { object_key: s.object_key, type: "video" as const }
          : { object_key: s.object_key, thumbnail_key: s.thumbnail_key, type: "image" as const },
      );
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
        place_id: selectedPlace?.id || undefined,
        journey_id: effectiveJourneyId ?? undefined,
        images,
      });
      onUploaded();
    } catch {
      setBusy(false);
    }
  }

  if (viewMode === "select-place" && matchingPlaces.length > 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-bold text-foreground">Bạn đang check-in tại đâu?</h3>
          <p className="text-xs text-muted-foreground">Chọn một địa điểm gần bạn để check-in:</p>
        </div>
        <div className="flex flex-col gap-2.5 max-h-[300px] overflow-y-auto pr-1">
          {matchingPlaces.map((p) => {
            const cat = CATEGORIES.find((c) => c.key === p.category);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectPlace(p)}
                className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-3 text-left shadow-sm transition-colors hover:border-primary/50 hover:bg-primary-50/40"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary-100 bg-primary-50 text-primary">
                  <Icon name={cat?.icon || "pin"} size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{p.name}</p>
                    <span className="shrink-0 text-xs font-semibold text-primary">
                      cách {Math.round(p.distance)}m
                    </span>
                  </div>
                  {p.address && <p className="truncate text-xs text-muted-foreground mt-0.5">{p.address}</p>}
                </div>
              </button>
            );
          })}
        </div>
        <div className="border-t border-border/60 pt-3">
          <Button
            type="button"
            className="w-full justify-center gap-1.5"
            onClick={handleCreateNewPlace}
          >
            <Icon name="plus" size={16} /> Tạo địa điểm mới
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {selectedPlace && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary-100 bg-primary-50 p-3 shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary-100 bg-surface text-primary">
              <Icon name={CATEGORIES.find((c) => c.key === selectedPlace.category)?.icon || "pin"} size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground font-medium">Check-in tại địa điểm</p>
              <p className="truncate text-sm font-bold text-foreground">{selectedPlace.name}</p>
            </div>
          </div>
          {!place && (
            <button
              type="button"
              onClick={() => setViewMode("select-place")}
              className="shrink-0 text-xs font-bold text-primary hover:underline"
            >
              Thay đổi
            </button>
          )}
        </div>
      )}

      {!selectedPlace && matchingPlaces.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-3 shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted-foreground/10 text-muted-foreground">
              <Icon name="plus" size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground font-medium">Đang tạo địa điểm mới</p>
              <p className="truncate text-sm font-bold text-foreground">
                {name || "Chưa nhập tên địa điểm"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setViewMode("select-place")}
            className="shrink-0 text-xs font-bold text-primary hover:underline"
          >
            Xem danh sách
          </button>
        </div>
      )}

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

      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 shadow-card">
        <span className="flex items-center gap-2 font-display text-lg font-extrabold text-foreground">
          <Icon name="pin" size={20} className="text-primary" /> Địa điểm
        </span>
        <input
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (suggestionApplied) setSuggestionApplied(false);
          }}
          placeholder="Tên địa điểm"
          className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              disabled={!!selectedPlace}
              onClick={() => setCategory(c.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-bold transition-colors",
                category === c.key
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-surface-muted text-muted-foreground",
                selectedPlace && "opacity-60 cursor-not-allowed",
              )}
            >
              <Icon name={c.icon} size={16} /> {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
        <span className="flex items-center gap-2 font-display text-lg font-extrabold text-foreground">
          <Icon name="star" size={20} className="fill-gold text-gold" /> Đánh giá địa điểm
        </span>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n === rating ? undefined : n)}
              className={cn("rounded-full p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", rating && n <= rating ? "opacity-100" : "opacity-30")}
              aria-label={`${n} sao`}
            >
              <Icon name="star" size={30} className="fill-gold text-gold" />
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
        <span className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-display text-lg font-extrabold text-foreground">
            <Icon name="camera" size={20} className="text-primary" /> Thêm ảnh
          </span>
          <span className="text-xs font-semibold text-primary">{imageCount}/{maxImages} ảnh</span>
        </span>
        <div className="flex flex-wrap gap-2">
        {picked.map((p, i) => (
          <div key={p.url} className="relative h-20 w-20">
            <MediaPreview
              url={p.url}
              thumbnailUrl={p.thumbnailUrl}
              mediaType={p.type}
              galleryItems={picked.map((item) => ({
                url: item.url,
                thumbnailUrl: item.thumbnailUrl,
                mediaType: item.type,
              }))}
              galleryIndex={i}
              className="h-20 w-20 rounded-lg object-cover"
            />
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent-500 text-white shadow"
                aria-label={p.type === "video" ? "Xóa video" : "Xóa ảnh"}
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        {imageCount < maxImages && (
          <button
            type="button"
            onClick={addPhotos}
            disabled={imageProcessing}
            className={cn(
              "flex h-20 w-20 flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-border bg-surface-muted text-muted-foreground",
              imageProcessing ? "cursor-wait opacity-60" : "cursor-pointer",
            )}
          >
            {imageProcessing ? (
              <span className="text-xs">Đang xử lý…</span>
            ) : usePwaCamera ? (
              <Icon name="camera" size={24} />
            ) : (
              <>
                <Icon name="image" size={22} />
              </>
            )}
          </button>
        )}
        {/* {videoCount < MAX_VIDEOS && (
          <button
            type="button"
            onClick={addVideo}
            disabled={videoProcessing}
            className={cn(
              "flex h-20 w-20 flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed border-border text-muted-foreground",
              videoProcessing ? "cursor-wait opacity-60" : "cursor-pointer",
            )}
          >
            {videoProcessing ? (
              <span className="text-xs">Đang xử lý…</span>
            ) : (
              <Icon name="video" size={24} />
            )}
          </button>
        )} */}
        <input
          ref={imageFileRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          className="hidden"
          onChange={(e) => {
            void addFileArray(Array.from(e.target.files ?? []));
            e.target.value = ""; // allow re-picking the same file
          }}
        />
        <input
          ref={videoFileRef}
          type="file"
          accept="video/*,.mp4,.mov,.m4v,.webm,.mkv,.avi,.3gp,.3gpp"
          className="hidden"
          onChange={(e) => {
            void addFileArray(Array.from(e.target.files ?? []));
            e.target.value = ""; // allow re-picking the same file
          }}
        />
      </div>
      </div>

      <label className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 shadow-card">
        <span className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-display text-lg font-extrabold text-foreground">
            <Icon name="pencil" size={20} className="text-primary" /> Cảm nhận của bạn
          </span>
          <span className="text-xs text-muted-foreground">{note.length}/500</span>
        </span>
        <textarea
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Không gian, đồ uống, góc chụp, cảm xúc..."
          className="resize-none rounded-2xl border border-border bg-surface-muted p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </label>

      {err && <p className="text-sm text-accent-600">{err}</p>}

      <Button type="submit" variant="accent" size="lg" disabled={busy || processing || picked.length === 0} icon={<Icon name="flag-planted" size={22} />}>
        {busy ? "Đang lưu..." : "CẮM CỜ"}
      </Button>
      {cameraOpen && (
        <CameraCaptureSheet
          maxCount={maxImages - imageCount}
          onClose={() => setCameraOpen(false)}
          onDone={(files) => void addFileArray(files)}
        />
      )}
    </form>
  );
}

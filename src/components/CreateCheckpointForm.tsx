import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useCheckinQueue } from "../context/CheckinQueue";
import { useGeocode } from "../hooks/useGeocode";
import {
  getMyJourneys,
  getNearbyPlaces,
  getUploadSlots,
  putFilesToSlots,
  getNearbyAppPlaces,
  type UploadSlot,
} from "../lib/api";
import { cn } from "../lib/cn";
import { prepareCheckpointImage } from "../lib/image";
import { CATEGORIES } from "../lib/maps";
import { trackError, trackEvent } from "../lib/observability";
import { quickCheckinSettings } from "../lib/settings";
import { prepareCheckpointVideo } from "../lib/video";
import { CameraCaptureSheet } from "./CameraCaptureSheet";
import {
  CheckpointFormFields,
  CHECKPOINT_MAX_IMAGES,
  CHECKPOINT_MAX_VIDEOS,
  isProbablyVideoFile,
  type NewFormMedia,
} from "./CheckpointFormFields";
import { Button } from "./ui/Button";
import { Icon } from "./ui/Icon";
import { Skeleton } from "./ui/Skeleton";

interface PickedMedia { type: NewFormMedia["type"]; original: File; thumbnail: File;
  url: string;
  thumbnailUrl: string;
}

// Limits kept for reference; shared constants are in CheckpointFormFields.
const MAX_IMAGES = CHECKPOINT_MAX_IMAGES;

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

function formatTakenAt(takenAt: string): string {
  return new Date(takenAt).toLocaleString("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function CreateCheckpointForm({
  at,
  place,
  initialFiles,
  initialTakenAt,
  onUploaded,
  onReset,
  maxImages = MAX_IMAGES,
}: {
  at: { lat: number; lng: number };
  /** When set, check-in is to an existing place: name is fixed and place_id sent. */
  place?: CheckinPlace;
  /** Pre-load these files into the image picker on mount (photo check-in flow). */
  initialFiles?: File[];
  /** Capture timestamp read from the source photo's EXIF metadata. */
  initialTakenAt?: string;
  onUploaded: () => void;
  /** Called when all images are removed (e.g. photo check-in flow → back to picker). */
  onReset?: () => void;
  maxImages?: number;
}) {
  const { t } = useTranslation();
  const { enqueue } = useCheckinQueue();
  // Pick which active journey this check-in is recorded under (multiple can be
  // active). Default to the most recently activated one until the user changes.
  const { data: journeys = [] } = useQuery({ queryKey: ["journeys"], queryFn: getMyJourneys });
  const activeJourneys = journeys
    .filter((j) => j.is_active)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const defaultJourneyId = activeJourneys[0]?.id ?? null;
  const [journeyId, setJourneyId] = useState<string | null>(defaultJourneyId);

  const [selectedPlace, setSelectedPlace] = useState<CheckinPlace | null>(place ?? null);
  const [viewMode, setViewMode] = useState<"select-place" | "fill-form">(
    place ? "fill-form" : "select-place"
  );
  const initializedViewRef = useRef(false);

  const [form, setForm] = useState({
    name: place?.name ?? "",
    category: place?.category ?? "cafe",
    note: "",
    rating: undefined as number | undefined,
    suggestionApplied: false,
  });
  const [picked, setPicked] = useState<PickedMedia[]>([]);
  const [err, setErr] = useState<string | null>(null);
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
    if (place || initializedViewRef.current || !nearbyAppPlacesFetched) return;
    if (matchingPlaces.length === 0) {
      setViewMode("fill-form");
    }
    initializedViewRef.current = true;
  }, [place, matchingPlaces.length, nearbyAppPlacesFetched]);

  const handleSelectPlace = (p: CheckinPlace) => {
    setSelectedPlace(p);
    setForm((prev) => ({ ...prev, name: p.name, category: p.category }));
    setViewMode("fill-form");
  };

  const handleCreateNewPlace = () => {
    setSelectedPlace(null);
    const top = placeSuggestions.find((s) => s.name?.trim());
    if (top) {
      setForm((prev) => ({ ...prev, name: top.name.trim(), category: top.category || "other" }));
    } else if (geo) {
      const suggestion = geo.address.split(",")[0].trim();
      setForm((prev) => ({ ...prev, name: suggestion || "", category: "other" }));
    } else {
      autoFillResolved.current = false;
      setForm((prev) => ({ ...prev, name: "", category: "cafe" }));
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
  const [processing, setProcessing] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const cameraAvailable = canUseCamera();
  const phonePwa = isPhonePwa();
  const usePwaCamera = phonePwa && cameraAvailable;
  const autoCameraAttempted = useRef(false);

  // Revoke object URLs on unmount (read latest via ref to avoid stale closure).
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  const imageCount = picked.filter((p) => p.type === "image").length;
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
      if (form.name) return;
      setForm((prev) => ({
        ...prev,
        name: top.name.trim(),
        category: top.category || "other",
        suggestionApplied: true,
      }));
      return;
    }

    if (!geo) return;
    const suggestion = geo.address.split(",")[0].trim();
    if (!suggestion) return;
    autoFillResolved.current = true;
    if (!form.name) setForm((prev) => ({ ...prev, name: suggestion }));
  }, [geo, form.name, place, placeSuggestions, placeSuggestionsFetched]);

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

    setProcessing(true);
    setErr(null);
    try {
      let nextImageCount = pickedRef.current.filter((p) => p.type === "image").length;
      let nextVideoCount = pickedRef.current.filter((p) => p.type === "video").length;
      const prepared: PickedMedia[] = [];
      for (const file of files) {
        const isVideo = isProbablyVideoFile(file);
        if (isVideo) {
          if (nextVideoCount >= CHECKPOINT_MAX_VIDEOS) {
            setErr(t('toi_da_1_videocheckin'));
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
          setErr(t('toi_da_anh_checkin', { maxImages: maxImages }));
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
      setErr(e instanceof Error ? e.message : t('khong_xu_ly_duoc_media'));
    } finally {
      setProcessing(false);
    }
  }

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
      setErr(t('bat_buoc_phai_co_it'));
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
      setErr(t('khong_lay_duoc_link_upload'));
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
      setErr(t('upload_anhvideo_that_bai_vui'));
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
        name: form.name,
        category: form.category,
        note: form.note || undefined,
        rating: form.rating,
        lat: at.lat,
        lng: at.lng,
        address: geo?.address,
        province: geo?.provinceName,
        province_code: geo?.province,
        place_id: selectedPlace?.id || undefined,
        journey_id: journeyId ?? undefined,
        taken_at: initialTakenAt,
        images,
      });
      onUploaded();
    } catch {
      setBusy(false);
    }
  }

  if (viewMode === "select-place" && (!nearbyAppPlacesFetched || matchingPlaces.length > 0)) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-bold text-foreground">{t('ban_dang_checkin_tai_dau')}</h3>
          <p className="text-xs text-muted-foreground">{t('chon_mot_dia_diem_gan')}</p>
        </div>
        <div className="flex flex-col gap-2.5 max-h-[300px] overflow-y-auto pr-1">
          {!nearbyAppPlacesFetched ? (
            <div className="flex flex-col gap-2.5">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-3 text-left shadow-sm"
                >
                  <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1 flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-10" />
                    </div>
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            matchingPlaces.map((p) => {
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
                        {t('cach_khoang_cach_m', { distance: Math.round(p.distance) })}
                      </span>
                    </div>
                    {p.address && <p className="truncate text-xs text-muted-foreground mt-0.5">{p.address}</p>}
                  </div>
                </button>
              );
            })
          )}
        </div>
        <div className="border-t border-border/60 pt-3">
          <Button
            type="button"
            className="w-full justify-center gap-1.5"
            onClick={handleCreateNewPlace}
          >
            <Icon name="plus" size={16} /> {t('tao_dia_diem_moi')}
          </Button>
        </div>
      </div>
    );
  }

  const pickedAsFormMedia = picked.map(
    (p): NewFormMedia => ({ kind: "new", ...p }),
  );

  return (
    <>
      {/* Place info cards, journey picker, EXIF — create-only UI above the shared form */}
      {selectedPlace && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary-100 bg-primary-50 p-3 shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary-100 bg-surface text-primary">
              <Icon name={CATEGORIES.find((c) => c.key === selectedPlace.category)?.icon || "pin"} size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground font-medium">{t('checkin_tai_dia_diem')}</p>
              <p className="truncate text-sm font-bold text-foreground">{selectedPlace.name}</p>
            </div>
          </div>
          {!place && (
            <button
              type="button"
              onClick={() => setViewMode("select-place")}
              className="shrink-0 text-xs font-bold text-primary hover:underline"
            >
              {t('thay_doi')}
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
              <p className="text-xs text-muted-foreground font-medium">{t('dang_tao_dia_diem_moi')}</p>
              <p className="truncate text-sm font-bold text-foreground">
                {form.name || t('chua_nhap_ten_dia_diem')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setViewMode("select-place")}
            className="shrink-0 text-xs font-bold text-primary hover:underline"
          >
            {t('xem_danh_sach')}
          </button>
        </div>
      )}

      {activeJourneys?.length > 0 && (
        <label className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-secondary">
            <Icon name="luggage" size={16} /> {t('ghi_vao_hanh_trinh')}
          </span>
          <select
            value={journeyId ?? ""}
            onChange={(e) => setJourneyId(e.target.value || null)}
            className="rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{t('khong_gan_hanh_trinh')}</option>
            {activeJourneys.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
        </label>
      )}

      {initialTakenAt && (
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-3 text-sm text-muted-foreground shadow-card">
          <Icon name="calendar" size={16} className="text-primary" />
          <span>
            {t('chup_luc')} <span className="font-semibold text-foreground">{formatTakenAt(initialTakenAt)}</span>
          </span>
        </div>
      )}

      <CheckpointFormFields
        mode="create"
        {...form}
        media={pickedAsFormMedia}
        mediaProcessing={processing}
        error={err}
        busy={busy}
        maxImages={maxImages}
        onNameChange={(value) => {
          setForm((prev) => ({ ...prev, name: value, suggestionApplied: false }));
        }}
        onNoteChange={(value) => setForm((prev) => ({ ...prev, note: value }))}
        onRatingChange={(value) => setForm((prev) => ({ ...prev, rating: value as number | undefined }))}
        onAddFiles={(files) => void addFileArray(files)}
        onRemoveMedia={removeAt}
        onSubmit={submit}
        submitLabel={t('cam_co').toUpperCase()}
        submitIcon={<Icon name="flag-planted" size={22} />}
        onAddMediaClick={usePwaCamera ? () => setCameraOpen(true) : undefined}
        addButtonIcon={usePwaCamera ? <Icon name="camera" size={24} /> : undefined}
        nameCardExtra={
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                disabled={!!selectedPlace}
                onClick={() => setForm((prev) => ({ ...prev, category: c.key }))}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-bold transition-colors",
                  form.category === c.key
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-surface-muted text-muted-foreground",
                  selectedPlace && "opacity-60 cursor-not-allowed",
                )}
              >
                <Icon name={c.icon} size={16} /> {t(c.labelKey)}
              </button>
            ))}
          </div>
        }
      >
        {cameraOpen && (
          <CameraCaptureSheet
            maxCount={maxImages - imageCount}
            onClose={() => setCameraOpen(false)}
            onDone={(files) => void addFileArray(files)}
          />
        )}
      </CheckpointFormFields>
    </>
  );
}

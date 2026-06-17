import { useQuery } from "@tanstack/react-query";
import Map, { Source, Layer, Marker } from "react-map-gl/maplibre";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getJourney, type JourneyStop, API_URL } from "../lib/api";
import { MAP_STYLE, DEFAULT_VIEW, categoryIcon } from "../lib/maps";
import { Icon } from "./ui/Icon";
import { MediaPreview } from "./MediaPreview";
import { Sheet } from "./ui/Sheet";
import { Skeleton } from "./ui/Skeleton";
import { ShareButton } from "./share/ShareButton";
import { renderJourneyCard } from "../lib/shareCard";
import { trackEvent } from "../lib/observability";

export function JourneyDetailSheet({
  id,
  onOpenCheckpoint,
  onClose,
}: {
  id: string;
  onOpenCheckpoint?: (checkpointId: string) => void;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({ queryKey: ["journey", id], queryFn: () => getJourney(id) });
  const stops = data?.checkpoints ?? [];

  const handleLoad = (map: MapLibreMap) => {
    if (stops?.length > 0) {
      const lngs = stops.map((s) => s.lng);
      const lats = stops.map((s) => s.lat);
      map.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: 48, maxZoom: 15, duration: 0 },
      );
    }
    const attrib = map.getContainer().querySelector(".maplibregl-ctrl-attrib");
    attrib?.classList.remove("maplibregl-compact-show");
    attrib?.removeAttribute("open");
  };

  const routeGeoJSON = {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "LineString" as const, coordinates: stops.map((s) => [s.lng, s.lat]) },
  };

  return (
    <Sheet grow className="h-full" onClose={onClose}>
      {isLoading || !data ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <Skeleton className="h-6 w-48" />
          <div className="grid shrink-0 grid-cols-3 gap-2">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
          <Skeleton className="h-48 w-full rounded-xl" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <h2 className="shrink-0 font-display text-xl font-bold">{data.journey.title}</h2>

          <div className="grid shrink-0 grid-cols-3 gap-2">
            <Stat label="Check-in" value={String(data.stats.checkpoint_count)} />
            <Stat label="KM" value={data.stats.distance_km.toFixed(1)} />
            <Stat label="XP" value={String(data.stats.total_xp)} />
          </div>

          {stops?.length > 0 && (
            <div className="min-h-80 flex-1 overflow-hidden rounded-xl">
              <Map
                initialViewState={DEFAULT_VIEW}
                mapStyle={MAP_STYLE}
                attributionControl={{ compact: true }}
                onLoad={(e) => handleLoad(e.target)}
              >
                {stops.length >= 2 && (
                  <Source id="route" type="geojson" data={routeGeoJSON}>
                    <Layer
                      id="route-line"
                      type="line"
                      layout={{ "line-cap": "round", "line-join": "round" }}
                      paint={{
                        "line-color": "#F4511E",
                        "line-width": 4,
                        "line-dasharray": [0, 2], // round cap + [0,2] → dotted
                      }}
                    />
                  </Source>
                )}
                {stops.map((s, i) => (
                  <Marker key={s.id} longitude={s.lng} latitude={s.lat} anchor="center">
                    <StopMarker stop={s} stops={stops} index={i} total={stops.length} />
                  </Marker>
                ))}
              </Map>
            </div>
          )}

          <div className="max-h-25 shrink-0 overflow-y-auto border-l-2 border-border pl-4">
            {stops.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có check-in nào trong hành trình.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {stops.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      trackEvent("journey_stop_open", { checkpoint_id: s.id });
                      onOpenCheckpoint?.(s.id);
                    }}
                    className="flex items-center gap-2 text-left text-sm"
                  >
                    <Icon name={categoryIcon(s.category)} size={18} className="text-muted-foreground" />
                    <span className="flex-1 font-medium">{s.name}</span>
                    <span className="text-xs text-subtle-foreground">
                      {new Date(s.created_at).toLocaleDateString("vi-VN")}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0 text-end">
            <ShareButton
              filename={`journey-${data.journey.id}.png`}
              title={data.journey.title}
              text={`Hành trình "${data.journey.title}" của mình trên Checkpoint!`}
              label="Chia sẻ hành trình"
              url={`${API_URL}/share/journey/${data.journey.id}`}
              render={() =>
                renderJourneyCard({
                  title: data.journey.title,
                  count: data.stats.checkpoint_count,
                  xp: data.stats.total_xp,
                  distanceKm: data.stats.distance_km,
                  date: new Date(
                    data.journey.started_at ?? data.journey.created_at,
                  ).toLocaleDateString("vi-VN"),
                  imageUrls: stops.map((s) => s.thumbnail_url ?? s.image_url).filter(Boolean) as string[],
                  url: `${API_URL}/share/journey/${data.journey.id}`,
                })
              }
            />
          </div>
        </div>
      )}
    </Sheet>
  );
}

type StopMarkerMeta =
  | {
      kind: "icon";
      iconName: "play" | "flag";
      tone: string;
      ariaLabel: string;
    }
  | {
      kind: "number";
      label: string;
      tone: string;
      ariaLabel: string;
    };

function getStopMarkerMeta(index: number, total: number): StopMarkerMeta {
  if (total <= 1) {
    return {
      kind: "number",
      label: "1",
      tone: "bg-primary text-primary-foreground",
      ariaLabel: "Điểm duy nhất",
    };
  }
  if (index === 0) {
    return {
      kind: "icon",
      iconName: "play",
      tone: "bg-emerald-600 text-white",
      ariaLabel: "Điểm bắt đầu",
    };
  }
  if (index === total - 1) {
    return {
      kind: "icon",
      iconName: "flag",
      tone: "bg-accent-600 text-white",
      ariaLabel: "Điểm kết thúc",
    };
  }
  return {
    kind: "number",
    label: String(index + 1),
    tone: "bg-primary text-primary-foreground",
    ariaLabel: `Điểm số ${index + 1}`,
  };
}

function StopMarker({
  stop,
  stops,
  index,
  total,
}: {
  stop: JourneyStop;
  stops: JourneyStop[];
  index: number;
  total: number;
}) {
  const meta = getStopMarkerMeta(index, total);

  if (stop.image_url) {
    return <StopPhotoStack stop={stop} stops={stops} index={index} total={total} />;
  }

  return (
    <span
      title={meta.ariaLabel}
      className={`flex h-8 min-w-8 items-center justify-center rounded-full border-[3px] border-white px-1 shadow-lg ${meta.tone}`}
    >
      <StopMarkerBadgeContent meta={meta} />
    </span>
  );
}

/** Cover photo for one journey stop, shown as a small rotated card. */
function StopPhotoStack({
  stop,
  stops,
  index,
  total,
}: {
  stop: JourneyStop;
  stops: JourneyStop[];
  index: number;
  total: number;
}) {
  if (!stop.image_url) return null;
  const meta = getStopMarkerMeta(index, total);

  return (
    <div className="relative h-14 w-14 translate-y-1.5" title={meta.ariaLabel}>
      <MediaPreview
        url={stop.image_url}
        thumbnailUrl={stop.thumbnail_url}
        mediaType={stop.media_type}
        alt={stop.name}
        caption={<StopCaption stop={stop} />}
        galleryItems={stops
          .filter((item) => item.image_url)
          .map((item) => ({
            url: item.image_url,
            thumbnailUrl: item.thumbnail_url,
            mediaType: item.media_type,
            alt: item.name,
            caption: <StopCaption stop={item} />,
          }))}
        galleryIndex={stops.filter((item) => item.image_url).findIndex((item) => item.id === stop.id)}
        className="absolute h-10 w-10 -rotate-6 rounded-md border-2 border-white object-cover shadow-md"
      />
      <StopMarkerBadge meta={meta} />
    </div>
  );
}

function StopMarkerBadge({ meta }: { meta: StopMarkerMeta }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute bottom-5 left-6 z-20 flex h-5 min-w-5 -translate-x-1/2 translate-y-1/2 items-center justify-center rounded-full border-[2px] border-white px-1 shadow-lg ${meta.tone}`}
    >
      <StopMarkerBadgeContent meta={meta} />
    </span>
  );
}

function StopMarkerBadgeContent({ meta }: { meta: StopMarkerMeta }) {
  if (meta.kind === "icon") {
    return (
      <Icon
        name={meta.iconName}
        size={10}
        className={meta.iconName === "play" ? "ml-0.5 fill-white" : undefined}
        strokeWidth={2.4}
      />
    );
  }
  return <span className="text-sm font-black leading-none">{meta.label}</span>;
}

function StopCaption({ stop }: { stop: JourneyStop }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] bg-gradient-to-t from-black/80 to-transparent p-4 pb-8 text-center text-white">
      <p className="font-display text-lg font-bold">{stop.name}</p>
      {stop.note && <p className="text-sm">{stop.note}</p>}
      {stop.address && (
        <div className="mt-0.5 flex items-start justify-center gap-1 text-xs opacity-80">
          <Icon name="map-pin" size={12} className="mt-0.5 shrink-0" />
          <span>{stop.address}</span>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-muted py-2 text-center">
      <p className="font-display text-lg font-bold text-clay-600">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

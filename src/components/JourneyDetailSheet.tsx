import { useQuery } from "@tanstack/react-query";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Map, { Layer, Marker, Source } from "react-map-gl/maplibre";
import { useAuth } from "../auth/AuthContext";
import { getJourney, type JourneyStop } from "../lib/api";
import i18n from "../lib/i18n";
import { categoryIcon, DEFAULT_VIEW, MAP_STYLE } from "../lib/maps";
import { trackEvent } from "../lib/observability";
import { getShareUrl } from "../lib/share";
import { MediaPreview } from "./MediaPreview";
import { ShareButton } from "./share/ShareButton";
import { Icon } from "./ui/Icon";
import { Sheet } from "./ui/Sheet";
import { Skeleton } from "./ui/Skeleton";

export function JourneyDetailSheet({
  id,
  onOpenCheckpoint,
  onClose,
}: {
  id: string;
  onOpenCheckpoint?: (checkpointId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ["journey", id], queryFn: () => getJourney(id) });
  // Journeys are viewable by anyone (deep link / other profiles), so only claim
  // ownership ("của mình") when the journey actually belongs to the viewer.
  const isMine = user != null && data != null && data.journey.user_id === user.id;
  const stops = data?.checkpoints ?? [];
  const mapRef = useRef<MapLibreMap | null>(null);
  const [focusedStopId, setFocusedStopId] = useState<string | null>(null);

  const focusStop = useCallback((stop: JourneyStop) => {
    setFocusedStopId(stop.id);
    mapRef.current?.flyTo({
      center: [stop.lng, stop.lat],
      zoom: 16,
      duration: 700,
      essential: true,
    });
    trackEvent("journey_stop_focus", { checkpoint_id: stop.id });
  }, []);

  const handleLoad = (map: MapLibreMap) => {
    mapRef.current = map;
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
    <Sheet grow className="h-[94dvh]" onClose={onClose}>
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
            <div className="flex-1 overflow-hidden rounded-xl">
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
                    <StopMarker
                      stop={s}
                      stops={stops}
                      index={i}
                      total={stops.length}
                      focused={focusedStopId === s.id}
                    />
                  </Marker>
                ))}
              </Map>
            </div>
          )}

          <div className="max-h-50 shrink-0 overflow-y-auto rounded-xl border border-border bg-surface">
            {stops.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">{t('chua_co_checkin_nao_trong')}</p>
            ) : (
              <div className="py-1">
                {stops.map((s, i) => (
                  <StopListItem
                    key={s.id}
                    stop={s}
                    index={i}
                    total={stops.length}
                    focused={focusedStopId === s.id}
                    onFocus={() => focusStop(s)}
                    onOpen={onOpenCheckpoint ? () => {
                      trackEvent("journey_stop_open", { checkpoint_id: s.id });
                      onOpenCheckpoint(s.id);
                    } : undefined}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0 text-end">
            <ShareButton
              title={data.journey.title}
              text={`${t('hanh_trinh')} "${data.journey.title}" ${isMine ? t('cua_minh_tren_checkpoint') : t('tren_checkpoint')}`}
              label={t('chia_se_hanh_trinh')}
              url={getShareUrl(data.journey.id, "journey")}
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
      ariaLabel: i18n.t('diem_duy_nhat'),
    };
  }
  if (index === 0) {
    return {
      kind: "icon",
      iconName: "play",
      tone: "bg-emerald-600 text-white",
      ariaLabel: i18n.t('diem_bat_dau'),
    };
  }
  if (index === total - 1) {
    return {
      kind: "icon",
      iconName: "flag",
      tone: "bg-accent-600 text-white",
      ariaLabel: i18n.t('diem_ket_thuc'),
    };
  }
  return {
    kind: "number",
    label: String(index + 1),
    tone: "bg-primary text-primary-foreground",
    ariaLabel: i18n.t('diem_so_index_1', { number: index + 1 }),
  };
}

function StopMarker({
  stop,
  stops,
  index,
  total,
  focused,
}: {
  stop: JourneyStop;
  stops: JourneyStop[];
  index: number;
  total: number;
  focused: boolean;
}) {
  const meta = getStopMarkerMeta(index, total);

  if (stop.image_url) {
    return <StopPhotoStack stop={stop} stops={stops} index={index} total={total} focused={focused} />;
  }

  return (
    <span
      title={meta.ariaLabel}
      className={`flex h-8 min-w-8 items-center justify-center rounded-full border-[3px] border-white px-1 shadow-lg transition-transform ${focused ? "scale-125 ring-4 ring-primary/30" : ""} ${meta.tone}`}
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
  focused,
}: {
  stop: JourneyStop;
  stops: JourneyStop[];
  index: number;
  total: number;
  focused: boolean;
}) {
  if (!stop.image_url) return null;
  const meta = getStopMarkerMeta(index, total);

  return (
    <div
      className={`relative h-14 w-14 translate-y-1.5 transition-transform ${focused ? "scale-125" : ""}`}
      title={meta.ariaLabel}
    >
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
        className={`absolute h-10 w-10 -rotate-6 rounded-md border-2 border-white object-cover shadow-md ${focused ? "ring-4 ring-primary/30" : ""}`}
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

function StopMarkerBadgeContent({
  meta,
  size = 10,
  numberClassName = "text-sm",
}: {
  meta: StopMarkerMeta;
  size?: number;
  numberClassName?: string;
}) {
  if (meta.kind === "icon") {
    return (
      <Icon
        name={meta.iconName}
        size={size}
        className={meta.iconName === "play" ? "ml-0.5 fill-white" : undefined}
        strokeWidth={2.4}
      />
    );
  }
  return <span className={`${numberClassName} font-black leading-none`}>{meta.label}</span>;
}

function StopListItem({
  stop,
  index,
  total,
  focused,
  onFocus,
  onOpen,
}: {
  stop: JourneyStop;
  index: number;
  total: number;
  focused: boolean;
  onFocus: () => void;
  onOpen?: () => void;
}) {
  const { t } = useTranslation();
  const meta = getStopMarkerMeta(index, total);
  const isFirst = index === 0;
  const isLast = index === total - 1;

  return (
    <div
      className={`flex w-full items-stretch transition-colors ${focused ? "bg-primary-50" : "hover:bg-surface-muted"}`}
    >
      <button
        type="button"
        onClick={onFocus}
        className="group flex min-w-0 flex-1 items-stretch gap-3 px-3 text-left text-sm"
      >
        <span className="relative flex w-6 shrink-0 justify-center">
          {!isFirst && <span className="absolute top-0 h-1/2 w-px bg-border" aria-hidden="true" />}
          {!isLast && <span className="absolute bottom-0 h-1/2 w-px bg-border" aria-hidden="true" />}
          <span
            title={meta.ariaLabel}
            className={`relative z-10 my-3 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white px-1 shadow-sm ${focused ? "ring-4 ring-primary/20" : ""} ${meta.tone}`}
          >
            <StopMarkerBadgeContent meta={meta} size={9} numberClassName="text-[11px]" />
          </span>
        </span>
        <span className="my-2.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-muted-foreground">
          <Icon name={categoryIcon(stop.category)} size={15} />
        </span>
        <span className="my-2.5 min-w-0 flex-1">
          <span className="block truncate font-semibold text-foreground">{stop.name}</span>
          {stop.address && <span className="block truncate text-xs text-muted-foreground">{stop.address}</span>}
        </span>
        <span className="my-2.5 shrink-0 text-xs text-subtle-foreground">
          {new Date(stop.created_at).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}
        </span>
      </button>
      {onOpen && (
        <button
          type="button"
          onClick={onOpen}
          className="my-2.5 mr-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-muted-foreground transition hover:bg-primary hover:text-primary-foreground"
          aria-label={t('mo_stopname', { name: stop.name })}
        >
          <Icon name="eye" size={14} />
        </button>
      )}
    </div>
  );
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

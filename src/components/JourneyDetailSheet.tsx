import { useQuery } from "@tanstack/react-query";
import Map, { Source, Layer, Marker } from "react-map-gl/maplibre";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import { getJourney, type JourneyStop } from "../lib/api";
import { MAP_STYLE, DEFAULT_VIEW, categoryIcon } from "../lib/maps";
import { Sheet } from "./ui/Sheet";
import { Skeleton } from "./ui/Skeleton";
import { ShareButton } from "./share/ShareButton";
import { renderJourneyCard } from "../lib/shareCard";

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
    <Sheet grow onClose={onClose}>
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
            <div className="min-h-40 flex-1 overflow-hidden rounded-xl">
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
                    {s.images?.length > 0 ? (
                      <StopPhotoStack stop={s} />
                    ) : (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground ring-2 ring-white">
                        {i + 1}
                      </span>
                    )}
                  </Marker>
                ))}
              </Map>
            </div>
          )}

          <div className="max-h-44 shrink-0 overflow-y-auto border-l-2 border-border pl-4">
            {stops.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có check-in nào trong hành trình.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {stops.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onOpenCheckpoint?.(s.id)}
                    className="flex items-center gap-2 text-left text-sm"
                  >
                    <span className="text-lg">{categoryIcon(s.category)}</span>
                    <span className="flex-1 font-medium">{s.name}</span>
                    <span className="text-xs text-subtle-foreground">
                      {new Date(s.created_at).toLocaleDateString("vi-VN")}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0">
            <ShareButton
              filename={`journey-${data.journey.id}.png`}
              title={data.journey.title}
              text={`Hành trình "${data.journey.title}" của mình trên Checkpoint!`}
              label="Chia sẻ hành trình"
              url={`${window.location.origin}/j/${data.journey.id}`}
              render={() =>
                renderJourneyCard({
                  title: data.journey.title,
                  count: data.stats.checkpoint_count,
                  xp: data.stats.total_xp,
                  distanceKm: data.stats.distance_km,
                  date: new Date(
                    data.journey.started_at ?? data.journey.created_at,
                  ).toLocaleDateString("vi-VN"),
                  imageUrls: stops.flatMap((s) => s.images),
                  url: `${window.location.origin}/j/${data.journey.id}`,
                })
              }
            />
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** Photos for one journey stop, shown on its map marker as stacked "cards".
 *  Up to 2 visible, a "+N" placeholder beyond that. Click → lightbox of this
 *  stop's photos, captioned with name/note/address. */
function StopPhotoStack({ stop }: { stop: JourneyStop }) {
  const imgs = stop.images;
  const visible = imgs.slice(0, 2);
  const extra = imgs.length - 2;

  const caption = (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] bg-gradient-to-t from-black/80 to-transparent p-4 pb-8 text-center text-white">
      <p className="font-display text-lg font-bold">{stop.name}</p>
      {stop.note && <p className="text-sm">{stop.note}</p>}
      {stop.address && <p className="mt-0.5 text-xs opacity-80">📍 {stop.address}</p>}
    </div>
  );

  const card = "absolute h-10 w-10 rounded-md border-2 border-white object-cover shadow-md";
  const rotations = ["-rotate-6", "rotate-3"];

  return (
    <PhotoProvider overlayRender={() => caption}>
      <div className="relative h-12 w-12 translate-y-1.5">
        {visible.map((url, i) => (
          <PhotoView key={i} src={url}>
            <img src={stop.thumbnail_images?.[i] ?? url} alt="" className={`${card} cursor-zoom-in ${rotations[i]}`} style={{ zIndex: i }} />
          </PhotoView>
        ))}
        {extra > 0 && (
          <PhotoView src={imgs[2]}>
            <div
              className={`${card} flex items-center justify-center bg-clay-700 text-xs font-bold text-white`}
              style={{ zIndex: 5, transform: "rotate(8deg)" }}
            >
              +{extra}
            </div>
          </PhotoView>
        )}
        {imgs.slice(3).map((url, i) => (
          <PhotoView key={`h${i}`} src={url}>
            <span className="hidden" />
          </PhotoView>
        ))}
      </div>
    </PhotoProvider>
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

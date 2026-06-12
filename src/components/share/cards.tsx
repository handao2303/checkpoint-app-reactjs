import { useEffect, useState, type ReactNode } from "react";
import { categoryIcon } from "../../lib/maps";

const CARD_W = 540;

/** Fetch remote images and turn them into data URLs so html-to-image can bake
 *  them into the card with zero CORS/taint issues at capture time. `cache:
 *  "reload"` bypasses any non-CORS copy the page cached via a plain <img>.
 *  Needs the bucket's CORS to allow the app origin; failures just drop the photo. */
function useCardImages(urls: string[]): string[] {
  const [dataUrls, setDataUrls] = useState<string[]>([]);
  const key = urls.join("|");

  useEffect(() => {
    let active = true;
    Promise.all(
      urls.map(async (url) => {
        try {
          const res = await fetch(url, { mode: "cors", cache: "reload" });
          if (!res.ok) return null;
          const blob = await res.blob();
          return await new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          });
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (active) setDataUrls(results.filter((r): r is string => r !== null));
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return dataUrls;
}

/** Branded shell: fixed size, gradient, pin + wordmark. */
function CardShell({ gradient, children }: { gradient: string; children: ReactNode }) {
  return (
    <div style={{ width: CARD_W }} className={`flex flex-col gap-5 ${gradient} p-8 text-white`}>
      <div className="flex items-center gap-2">
        <img src="/pin.svg" alt="" className="h-8 w-8" />
        <span className="font-display text-2xl font-extrabold">Checkpoint</span>
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-xl bg-white/15 px-3 py-3 text-center">
      <p className="font-display text-2xl font-bold">{value}</p>
      <p className="text-xs text-white/80">{label}</p>
    </div>
  );
}

/** Photo collage (data URLs). 1 = hero, 2 = side by side, 3 = one wide + two. */
function PhotoGrid({ urls }: { urls: string[] }) {
  const imgs = urls.slice(0, 3);
  if (imgs.length === 0) return null;
  return (
    <div className={`grid gap-1.5 ${imgs.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
      {imgs.map((url, i) => (
        <img
          key={i}
          src={url}
          alt=""
          className={`w-full rounded-xl object-cover ${
            imgs.length === 1 ? "h-64" : imgs.length === 3 && i === 0 ? "col-span-2 h-44" : "h-36"
          }`}
        />
      ))}
    </div>
  );
}

export function CheckpointShareCard({
  name,
  category,
  note,
  address,
  xp,
  author,
  date,
  imageUrls = [],
}: {
  name: string;
  category: string;
  note?: string | null;
  address?: string | null;
  xp: number;
  author: string;
  date: string;
  imageUrls?: string[];
}) {
  const photos = useCardImages(imageUrls);
  return (
    <CardShell gradient="bg-[image:var(--gradient-primary)]">
      <PhotoGrid urls={photos} />

      <div className="flex items-center gap-4">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-4xl">
          {categoryIcon(category)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-3xl font-extrabold leading-tight">{name}</h2>
          {address && <p className="mt-1 text-sm text-white/85">📍 {address}</p>}
        </div>
      </div>

      {note && <p className="text-lg leading-snug text-white/95">“{note}”</p>}

      <div className="flex items-center justify-between border-t border-white/25 pt-4 text-sm">
        <span className="rounded-full bg-white/20 px-3 py-1 font-bold">+{xp} XP</span>
        <span className="text-white/85">bởi {author}</span>
        <span className="text-white/70">{date}</span>
      </div>
    </CardShell>
  );
}

export function JourneyShareCard({
  title,
  count,
  xp,
  distanceKm,
  date,
  imageUrls = [],
}: {
  title: string;
  count: number;
  xp: number;
  distanceKm: number;
  date: string;
  imageUrls?: string[];
}) {
  const photos = useCardImages(imageUrls);
  return (
    <CardShell gradient="bg-[image:var(--gradient-passport)]">
      <PhotoGrid urls={photos} />

      <div>
        <p className="text-sm font-bold uppercase tracking-wider text-white/70">Hành trình</p>
        <h2 className="font-display text-3xl font-extrabold leading-tight">{title}</h2>
      </div>

      <div className="flex gap-3">
        <Stat label="Check-in" value={String(count)} />
        <Stat label="XP" value={String(xp)} />
        <Stat label="Quãng đường" value={`${distanceKm.toFixed(1)}km`} />
      </div>

      <p className="border-t border-white/25 pt-4 text-right text-sm text-white/70">{date}</p>
    </CardShell>
  );
}

export function ProfileShareCard({
  name,
  username,
  level,
  totalXp,
  checkpointCount,
  journeyCount,
}: {
  name: string;
  username: string;
  level: number;
  totalXp: number;
  checkpointCount: number;
  journeyCount: number;
}) {
  return (
    <CardShell gradient="bg-[image:var(--gradient-passport)]">
      <div className="flex items-center gap-4 pt-2">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/20 font-display text-4xl font-bold">
          {(name[0] ?? "?").toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-3xl font-extrabold leading-tight">{name}</h2>
          <p className="text-sm text-white/80">@{username}</p>
        </div>
        <span className="rounded-full bg-white/20 px-3 py-1.5 font-display text-lg font-bold">
          Lv {level}
        </span>
      </div>

      <div className="flex gap-3">
        <Stat label="Tổng XP" value={totalXp.toLocaleString()} />
        <Stat label="Số cờ" value={String(checkpointCount)} />
        <Stat label="Hành trình" value={String(journeyCount)} />
      </div>

      <p className="border-t border-white/25 pt-3 text-center text-sm text-white/80">
        Hộ chiếu du lịch của tôi 🛂
      </p>
    </CardShell>
  );
}

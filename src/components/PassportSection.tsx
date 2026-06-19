import { t } from "../lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  getMyCheckpoints,
  getPassport,
  getUserByUsername,
  getUserCheckpoints,
  getUserPassport,
} from "../lib/api";
import { cn } from "../lib/cn";
import { MediaPreview } from "./MediaPreview";
import { Card } from "./ui/Card";
import { Icon } from "./ui/Icon";
import { Sheet } from "./ui/Sheet";
import { Toast } from "./ui/Toast";

interface PassportSectionProps {
  username?: string;
}

const STAMP_THEMES = {
  blue: {
    stroke: "#7FA8B8",
    bg: "#F2FAFC",
    text: "#5B8FA0",
  },
  green: {
    stroke: "#8CA96B",
    bg: "#F5FAEF",
    text: "#6F8F4F",
  },
  orange: {
    stroke: "#C98B5A",
    bg: "#FFF4EA",
    text: "#B67242",
  },
  brown: {
    stroke: "#C8A27C",
    bg: "#FAF5EF",
    text: "#A67C52",
  },
  locked: {
    stroke: "#D6C8BA",
    bg: "transparent",
    text: "#B8A99B",
  },
} as const;

function getProvinceInitials(province: string): string {
  const cleaned = province
    .replace(/^(Thành phố|Tỉnh)\s+/i, "")
    .trim();

  const words = cleaned.split(/\s+/);
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  return words
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .substring(0, 3);
}

function formatShortDate(isoString?: string): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).substring(2);
  return `${day}.${month}.${year}`;
}

export function PassportStampIcon({
  initials,
  date,
  shapeType,
}: {
  initials: string;
  date: string;
  shapeType: number;
}) {
  switch (shapeType) {
    case 0: // Circle / Compass style
      return (
        <svg viewBox="0 0 48 40" className="w-full h-full text-current" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="24" cy="20" r="17" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="24" cy="20" r="14" stroke="currentColor" strokeWidth="0.8" strokeDasharray="2 1" />
          <text
            x="24"
            y="18"
            textAnchor="middle"
            fill="currentColor"
            fontSize="10"
            fontWeight="900"
            fontFamily="Montserrat, sans-serif"
            letterSpacing="0.2"
          >
            {initials}
          </text>
          <line x1="16" y1="21" x2="32" y2="21" stroke="currentColor" strokeWidth="0.8" />
          <text
            x="24"
            y="28"
            textAnchor="middle"
            fill="currentColor"
            fontSize="5.5"
            fontWeight="800"
            fontFamily="Be Vietnam Pro, monospace"
          >
            {date}
          </text>
        </svg>
      );
    case 1: // Shield / Arch style
      return (
        <svg viewBox="0 0 48 40" className="w-full h-full text-current" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 34V12C12 7 18 5 24 5s12 2 12 7v22z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M15 32V13C15 9 20 7 24 7s9 2 9 6v19" stroke="currentColor" strokeWidth="0.8" strokeDasharray="2 1" />
          <text
            x="24"
            y="18"
            textAnchor="middle"
            fill="currentColor"
            fontSize="10"
            fontWeight="900"
            fontFamily="Montserrat, sans-serif"
          >
            {initials}
          </text>
          <line x1="17" y1="21" x2="31" y2="21" stroke="currentColor" strokeWidth="0.8" />
          <text
            x="24"
            y="28"
            textAnchor="middle"
            fill="currentColor"
            fontSize="5.5"
            fontWeight="800"
            fontFamily="Be Vietnam Pro, monospace"
          >
            {date}
          </text>
        </svg>
      );
    case 2: // Octagon style
      return (
        <svg viewBox="0 0 48 40" className="w-full h-full text-current" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 6h16l8 8v12l-8 8H16l-8-8V14z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M17 9h14l6 6v10l-6 6H17l-6-6V15z" stroke="currentColor" strokeWidth="0.8" strokeDasharray="2 1" />
          <text
            x="24"
            y="18"
            textAnchor="middle"
            fill="currentColor"
            fontSize="10"
            fontWeight="900"
            fontFamily="Montserrat, sans-serif"
          >
            {initials}
          </text>
          <line x1="14" y1="21" x2="34" y2="21" stroke="currentColor" strokeWidth="0.8" />
          <text
            x="24"
            y="28"
            textAnchor="middle"
            fill="currentColor"
            fontSize="5.5"
            fontWeight="800"
            fontFamily="Be Vietnam Pro, monospace"
          >
            {date}
          </text>
        </svg>
      );
    default: // Rect / Postage style
      return (
        <svg viewBox="0 0 48 40" className="w-full h-full text-current" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="9" y="7" width="30" height="26" rx="3" stroke="currentColor" strokeWidth="1.2" />
          <rect x="12" y="10" width="24" height="20" rx="1.5" stroke="currentColor" strokeWidth="0.8" strokeDasharray="2 1" />
          <text
            x="24"
            y="18"
            textAnchor="middle"
            fill="currentColor"
            fontSize="10"
            fontWeight="900"
            fontFamily="Montserrat, sans-serif"
          >
            {initials}
          </text>
          <line x1="15" y1="21" x2="33" y2="21" stroke="currentColor" strokeWidth="0.8" />
          <text
            x="24"
            y="28"
            textAnchor="middle"
            fill="currentColor"
            fontSize="5.5"
            fontWeight="800"
            fontFamily="Be Vietnam Pro, monospace"
          >
            {date}
          </text>
        </svg>
      );
  }
}

export function LockedStampIcon() {
  return (
    <span className="font-display text-2xl font-extrabold opacity-60 leading-none">
      ?
    </span>
  );
}

interface StampConfig {
  id: string;
  name: string;
  label: string;
  unlocked: boolean;
  count?: number;
  theme: typeof STAMP_THEMES[keyof typeof STAMP_THEMES];
  date: string;
  initials: string;
  shapeType: number;
  provinceCode?: string | null;
}

export function PassportStamp({
  stamp,
  onClick,
}: {
  stamp: StampConfig;
  onClick?: () => void;
}) {
  const { label, theme, unlocked, initials, date, shapeType } = stamp;
  return (
    <div className="flex flex-col items-center gap-1.5 shrink-0 select-none snap-start">
      <button
        type="button"
        onClick={onClick}
        title={unlocked ? t('stampname_da_ghe_tham_ngay', { name: stamp.name, date: stamp.date }) : t('cam_co_o_khu_vuc')}
        className={cn(
          "w-[64px] h-[64px] rounded-full border-[1.5px] flex items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer"
        )}
        style={{
          borderStyle: unlocked ? "solid" : "dashed",
          borderColor: theme.stroke,
          backgroundColor: theme.bg,
          color: theme.text,
          padding: unlocked ? "4px" : "0px",
        }}
      >
        {unlocked ? (
          <div className="w-[48px] h-[40px] flex items-center justify-center opacity-90">
            <PassportStampIcon initials={initials} date={date} shapeType={shapeType} />
          </div>
        ) : (
          <LockedStampIcon />
        )}
      </button>
      <div
        className="w-[72px] py-1 border rounded-lg bg-white/60 text-[9px] font-extrabold tracking-[0.2px] uppercase text-center truncate px-1 select-none leading-none"
        style={{
          borderColor: theme.stroke,
          color: theme.text,
        }}
      >
        {unlocked ? label : "?"}
      </div>
    </div>
  );
}

function getStampConfig(
  province: string,
  provinceCode?: string | null,
  dateStr?: string,
  count: number = 0,
): StampConfig {
  const name = province.trim();
  const initials = getProvinceInitials(name);
  const date = formatShortDate(dateStr);

  // Determinisic layout based on province name hash
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const uHash = Math.abs(hash);

  const shapeType = uHash % 4; // rotate through 4 decorative inner shapes

  const themes = [STAMP_THEMES.blue, STAMP_THEMES.green, STAMP_THEMES.orange, STAMP_THEMES.brown];
  const theme = themes[uHash % themes.length];

  const cleanLabel = name
    .replace(/^(Thành phố|Tỉnh)\s+/i, "")
    .trim()
    .toUpperCase();

  return {
    id: province,
    name: name.replace(/^(Thành phố|Tỉnh)\s+/i, "").trim(),
    label: cleanLabel,
    unlocked: true,
    count,
    theme,
    initials,
    date,
    shapeType,
    provinceCode,
  };
}

export function PassportSection({ username }: PassportSectionProps) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: username ? ["passport", username] : ["passport"],
    queryFn: username ? () => getUserPassport(username) : getPassport,
  });

  const [toastMessage, setToastMessage] = useState<ReactNode | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [selectedStampForPhotos, setSelectedStampForPhotos] = useState<StampConfig | null>(null);

  // Map unlocked stamps dynamically from user's visited provinces
  const unlockedStamps: StampConfig[] = (data?.stamps ?? []).map((s) => {
    return getStampConfig(s.province, s.province_code, s.first_at, s.checkin_count);
  });

  const unlockedCount = data?.province_count ?? 0;

  // Query checkpoints for selected stamp to display photos dynamically on click
  const { data: provinceCheckpoints = [], isLoading: isPhotosLoading } = useQuery({
    queryKey: ["passport-photos", username || "me", selectedStampForPhotos?.provinceCode, selectedStampForPhotos?.name],
    queryFn: async () => {
      if (!selectedStampForPhotos) return [];
      const code = selectedStampForPhotos.provinceCode || undefined;
      if (username) {
        const u = await getUserByUsername(username);
        const all = await getUserCheckpoints(u.id, 100, code);
        // Fallback filter for legacy rows without provinceCode
        if (!code) {
          const cleanName = selectedStampForPhotos.name.replace(/^(Thành phố|Tỉnh)\s+/i, "").trim().toLowerCase();
          return all.filter((cp) => (cp.address || "").toLowerCase().includes(cleanName) || (cp.name || "").toLowerCase().includes(cleanName));
        }
        return all;
      }
      const all = await getMyCheckpoints(100, code);
      // Fallback filter for legacy rows without provinceCode
      if (!code) {
        const cleanName = selectedStampForPhotos.name.replace(/^(Thành phố|Tỉnh)\s+/i, "").trim().toLowerCase();
        return all.filter((cp) => (cp.address || "").toLowerCase().includes(cleanName) || (cp.name || "").toLowerCase().includes(cleanName));
      }
      return all;
    },
    enabled: !!selectedStampForPhotos,
  });

  const handleStampClick = (stamp: StampConfig) => {
    if (stamp.unlocked) {
      setSelectedStampForPhotos(stamp);
    }
  };

  // Construct a single locked generic stamp card
  const nextLockedStamp: StampConfig = {
    id: "locked-next",
    name: t('dia_diem_moi'),
    label: "?",
    unlocked: false,
    theme: STAMP_THEMES.locked,
    date: "",
    initials: "?",
    shapeType: 0,
  };

  // Scroll list displays all unlocked stamps + 1 generic locked placeholder at the end
  const scrollItems = [...unlockedStamps, nextLockedStamp];
  const allStampsForSheet = [...unlockedStamps, nextLockedStamp];

  return (
    <Card className="bg-surface border border-border shadow-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-bold text-foreground">
          {t('ho_chieu')}
        </h3>
        {data && (
          <button
            type="button"
            onClick={() => setIsSheetOpen(true)}
            className="flex items-center gap-0.5 text-sm font-bold text-muted-foreground hover:text-foreground focus-visible:outline-none cursor-pointer animate-fade-in"
          >
            <Icon name="chevron-right" size={16} className="text-muted-foreground/60" />
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex gap-3 overflow-x-auto px-4 -mx-4 pb-2 scrollbar-none ">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5 shrink-0 snap-start">
              <div className="w-[64px] h-[64px] rounded-full bg-surface-muted border border-border/50 animate-pulse" />
              <div className="w-[72px] h-[18px] rounded-lg bg-surface-muted border border-border/50 animate-pulse" />
            </div>
          ))}
        </div>
      ) : unlockedCount === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border/60 bg-surface-muted p-6 text-center">
          <p className="text-sm font-semibold text-foreground mb-1">
            {username ? t('nguoi_dung_nay_chua_co') : t('ban_chua_mo_khoa_dia')}
          </p>
          <p className="text-xs text-muted-foreground">
            {username ? "" : t('hay_cam_co_o_khu')}
          </p>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto px-4 -mx-4 pb-2 scrollbar-none ">
          {scrollItems.map((stamp, i) => (
            <PassportStamp
              key={stamp.id || i}
              stamp={stamp}
              onClick={() => handleStampClick(stamp)}
            />
          ))}

          {unlockedCount > 4 && (
            <div className="flex flex-col items-center gap-1.5 shrink-0 select-none snap-start">
              <button
                type="button"
                onClick={() => setIsSheetOpen(true)}
                className="w-[64px] h-[64px] rounded-full border-[1.5px] border-solid flex items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                style={{
                  borderColor: "#EEDFD1",
                  backgroundColor: "#FFFDF8",
                  color: "#F05A28",
                }}
              >
                <Icon name="chevron-right" size={24} />
              </button>
              <div
                className="w-[72px] py-1 border border-solid rounded-lg bg-white/60 text-[9px] font-extrabold tracking-[0.2px] uppercase text-center truncate px-1 leading-none"
                style={{
                  borderColor: "#EEDFD1",
                  color: "#F05A28",
                }}
              >
                {t('tat_ca')}
              </div>
            </div>
          )}
        </div>
      )}

      {isSheetOpen && (
        <Sheet title={t('bo_suu_tap_ho_chieu')} onClose={() => setIsSheetOpen(false)}>
          <div className="grid grid-cols-4 gap-x-2 gap-y-4 justify-items-center py-4 max-h-[70vh] overflow-y-auto pr-1">
            {allStampsForSheet.map((stamp, i) => (
              <PassportStamp
                key={stamp.id || i}
                stamp={stamp}
                onClick={() => handleStampClick(stamp)}
              />
            ))}
          </div>
        </Sheet>
      )}

      {selectedStampForPhotos && (
        <Sheet
          title={t('khoanh_khac_tai_selectedstampforphotosname', { name: selectedStampForPhotos.name })}
          onClose={() => setSelectedStampForPhotos(null)}
        >
          <div className="py-4 max-h-[70vh] overflow-y-auto pr-1">
            {isPhotosLoading ? (
              <div className="flex justify-center py-8">
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
              </div>
            ) : provinceCheckpoints.filter((cp) => cp.image_url).length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                {t('khong_tim_thay_anh_chup')}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {provinceCheckpoints
                  .filter((cp) => cp.image_url)
                  .map((cp, idx, arr) => (
                    <MediaPreview
                      key={cp.id}
                      url={cp.image_url}
                      thumbnailUrl={cp.thumbnail_url}
                      mediaType={cp.media_type}
                      alt={cp.name}
                      className="aspect-square w-full rounded-lg object-cover border border-border/40"
                      galleryItems={arr.map((item) => ({
                        url: item.image_url,
                        thumbnailUrl: item.thumbnail_url,
                        mediaType: item.media_type,
                        alt: item.name,
                      }))}
                      galleryIndex={idx}
                    />
                  ))}
              </div>
            )}
          </div>
        </Sheet>
      )}

      {toastMessage && (
        <Toast message={toastMessage} onDone={() => setToastMessage(null)} />
      )}
    </Card>
  );
}

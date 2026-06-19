import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { disconnectPhotos, getPhotosStatus, initPhotosConnect } from "../lib/api";
import { trackEvent } from "../lib/observability";

export function GooglePhotosConnectCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: ["photos-status"],
    queryFn: getPhotosStatus,
    retry: false,
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      trackEvent("integration_connect_start", { provider: "photos" });
      const { auth_url } = await initPhotosConnect();
      window.location.href = auth_url;
    },
    onError: () => trackEvent("integration_connect_failed", { provider: "photos" }),
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectPhotos,
    onSuccess: () => {
      trackEvent("integration_disconnect_success", { provider: "photos" });
      void queryClient.invalidateQueries({ queryKey: ["photos-status"] });
    },
    onError: () => trackEvent("integration_disconnect_failed", { provider: "photos" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 rounded-lg py-3">
        <div className="h-8 w-8 animate-pulse rounded-full bg-surface-muted" />
        <div className="h-4 w-32 animate-pulse rounded bg-surface-muted" />
      </div>
    );
  }

  if (status?.connected) {
    return (
      <div className="flex items-center gap-3 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-50">
          <PhotosIcon />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Google Photos</p>
          <p className="text-xs text-muted-foreground">{t('da_ket_noi')}</p>
        </div>
        <button
          onClick={() => disconnectMutation.mutate()}
          disabled={disconnectMutation.isPending}
          className="shrink-0 text-xs text-destructive hover:underline disabled:opacity-50"
        >
          {disconnectMutation.isPending ? t('dang_ngat') : t('ngat_ket_noi')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-muted">
        <PhotosIcon className="opacity-50" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">Google Photos</p>
        <p className="text-xs text-muted-foreground">{t('chua_ket_noi')}</p>
      </div>
      <button
        onClick={() => connectMutation.mutate()}
        disabled={connectMutation.isPending}
        className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-105 active:scale-95 disabled:opacity-50"
      >
        {connectMutation.isPending ? t('dang_mo') : t('ket_noi')}
      </button>
    </div>
  );
}

function PhotosIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 192 192"
      xmlns="http://www.w3.org/2000/svg"
      className={`h-5 w-5 ${className}`}
      aria-hidden="true"
    >
      <path d="M96 32a64 64 0 0 0-64 64h64V32z" fill="#fbbc04" />
      <path d="M160 96a64 64 0 0 0-64-64v64h64z" fill="#ea4335" />
      <path d="M96 160a64 64 0 0 0 64-64H96v64z" fill="#34a853" />
      <path d="M32 96a64 64 0 0 0 64 64V96H32z" fill="#4285f4" />
    </svg>
  );
}

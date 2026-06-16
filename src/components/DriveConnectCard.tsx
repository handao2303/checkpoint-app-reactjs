import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { disconnectDrive, getDriveStatus, initDriveConnect } from "../lib/api";
import { trackEvent } from "../lib/observability";

export function DriveConnectCard() {
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: ["drive-status"],
    queryFn: getDriveStatus,
    retry: false,
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      trackEvent("integration_connect_start", { provider: "drive" });
      const { auth_url } = await initDriveConnect();
      window.location.href = auth_url;
    },
    onError: () => trackEvent("integration_connect_failed", { provider: "drive" }),
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectDrive,
    onSuccess: () => {
      trackEvent("integration_disconnect_success", { provider: "drive" });
      void queryClient.invalidateQueries({ queryKey: ["drive-status"] });
    },
    onError: () => trackEvent("integration_disconnect_failed", { provider: "drive" }),
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
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1a73e8]/10">
          <DriveIcon />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Google Drive</p>
          {status.email && (
            <p className="truncate text-xs text-muted-foreground">{status.email}</p>
          )}
        </div>
        <button
          onClick={() => disconnectMutation.mutate()}
          disabled={disconnectMutation.isPending}
          className="shrink-0 text-xs text-destructive hover:underline disabled:opacity-50"
        >
          {disconnectMutation.isPending ? "Đang ngắt..." : "Ngắt kết nối"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-muted">
        <DriveIcon className="opacity-50" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">Google Drive</p>
        <p className="text-xs text-muted-foreground">Chưa kết nối</p>
      </div>
      <button
        onClick={() => connectMutation.mutate()}
        disabled={connectMutation.isPending}
        className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-105 active:scale-95 disabled:opacity-50"
      >
        {connectMutation.isPending ? "Đang mở..." : "Kết nối"}
      </button>
    </div>
  );
}

function DriveIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 87.3 78"
      xmlns="http://www.w3.org/2000/svg"
      className={`h-5 w-5 ${className}`}
      aria-hidden="true"
    >
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
    </svg>
  );
}

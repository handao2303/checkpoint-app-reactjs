import { useCallback, useEffect, useState } from "react";
import { Icon } from "./ui/Icon";
import { Button } from "./ui/Button";
import { ERR_INSECURE, getCurrentCoords, isGeolocationSecure } from "../lib/geo";
import { getPlatform, isStandalone } from "../lib/platform";
import { trackError, trackEvent } from "../lib/observability";

/** Platform- and install-mode-specific steps to re-enable a blocked location
 *  permission (there is no web API to open these settings programmatically). */
function reenableSteps(): string[] {
  const platform = getPlatform();
  const pwa = isStandalone();

  if (platform === "android") {
    return pwa
      ? [
          "Nhấn giữ biểu tượng app Checkpoint ở màn hình chính",
          "Chọn “Thông tin ứng dụng” (ⓘ)",
          "Quyền → Vị trí → Cho phép",
          "Mở lại app rồi thử check-in",
        ]
      : [
          "Nhấn biểu tượng 🔒 / ⓘ bên trái thanh địa chỉ",
          "Quyền (Permissions) → Vị trí (Location) → Cho phép",
          "Tải lại trang",
        ];
  }
  if (platform === "ios") {
    return pwa
      ? [
          "Mở Cài đặt iPhone",
          "Vuốt xuống tìm “Checkpoint” (hoặc Safari)",
          "Vị trí → chọn “Khi dùng ứng dụng”",
          "Mở lại app",
        ]
      : [
          "Bấm “あ/AA” cạnh thanh địa chỉ → Cài đặt trang web",
          "Vị trí → Cho phép (hoặc Cài đặt → Safari → Vị trí)",
          "Tải lại trang",
        ];
  }
  return pwa
    ? [
        "Bấm biểu tượng ⚙ / 🔒 trên thanh tiêu đề cửa sổ app",
        "Site settings → Vị trí (Location) → Cho phép",
        "Tải lại",
      ]
    : [
        "Bấm biểu tượng 🔒 bên trái địa chỉ web",
        "Vị trí (Location) → Cho phép (Allow)",
        "Tải lại trang",
      ];
}

/** Permission explainer + re-enable guidance (presentation-agnostic). Rendered
 *  in a Sheet on the Map, or full-page on the Create tab. */
export function LocationPermissionContent({
  onGranted,
  onCancel,
}: {
  onGranted: (coords: { lat: number; lng: number }) => void;
  onCancel?: () => void;
}) {
  const [state, setState] = useState<PermissionState | "unknown">("unknown");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchPosition = useCallback(() => {
    setBusy(true);
    setError(null);
    // getCurrentCoords records a durable "located before" flag on success, so the
    // app can locate silently on the next launch instead of re-asking (iOS PWAs
    // lose the Permissions API state across relaunches).
    getCurrentCoords().then(
      (coords) => {
        setBusy(false);
        trackEvent("location_granted", { source: "permission_content" });
        onGranted(coords);
      },
      (err: GeolocationPositionError | Error) => {
        setBusy(false);
        // Non-secure origin: iOS won't even show the prompt — explain why.
        if (err instanceof Error && err.message === ERR_INSECURE) {
          setError("Định vị cần kết nối an toàn (HTTPS). Hãy mở app qua đường dẫn https://…");
          trackEvent("location_insecure_context");
          return;
        }
        if ("code" in err && err.code === err.PERMISSION_DENIED) {
          setState("denied");
          trackEvent("location_denied", { source: "permission_content" });
        } else {
          setError("Không lấy được vị trí. Vui lòng thử lại.");
          trackError(err, { feature: "location", action: "permission_content" }, "warn");
        }
      },
    );
  }, [onGranted]);

  // Track the live permission state so we can auto-continue the moment the user
  // flips it back to "granted" in settings — without them re-tapping.
  useEffect(() => {
    let status: PermissionStatus | null = null;
    let active = true;
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((s) => {
        if (!active) return;
        status = s;
        setState(s.state);
        s.onchange = () => {
          setState(s.state);
          if (s.state === "granted") fetchPosition();
        };
      })
      .catch(() => setState("prompt"));
    return () => {
      active = false;
      if (status) status.onchange = null;
    };
  }, [fetchPosition]);

  const denied = state === "denied";
  const insecure = !isGeolocationSecure();

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 text-primary">
        <Icon name="map-pin" size={32} />
      </span>
      <h2 className="font-display text-lg font-bold">
        {denied ? "Vị trí đang bị chặn" : "Cho phép định vị"}
      </h2>

      {denied ? (
        <>
          <p className="text-sm text-muted-foreground">Bạn đã chặn quyền vị trí. Bật lại theo các bước:</p>
          <ol className="w-full list-decimal space-y-1 rounded-xl bg-surface-muted p-3 pl-7 text-left text-sm">
            {reenableSteps().map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <Button className="w-full" disabled={busy} onClick={fetchPosition}>
            {busy ? "Đang kiểm tra..." : "Tôi đã bật, thử lại"}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Checkpoint cần vị trí của bạn để cắm cờ đúng nơi bạn đang đứng. Vị trí chỉ dùng cho lần
            check-in này.
          </p>
          {insecure && (
            <p className="text-sm text-accent-600">
              Trình duyệt chỉ cho phép định vị qua HTTPS. Hãy mở app bằng đường dẫn https://…
            </p>
          )}
          {error && <p className="text-sm text-accent-600">{error}</p>}
          <Button
            className="w-full"
            disabled={busy || insecure}
            icon={<Icon name="map-pin" size={20} />}
            onClick={fetchPosition}
          >
            {busy ? "Đang lấy vị trí..." : "Cho phép định vị"}
          </Button>
        </>
      )}

      {onCancel && (
        <button onClick={onCancel} className="text-sm text-muted-foreground">
          Để sau
        </button>
      )}
    </div>
  );
}

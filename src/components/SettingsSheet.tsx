import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Sheet } from "./ui/Sheet";
import { DriveConnectCard } from "./DriveConnectCard";
import { quickCheckinSettings } from "../lib/settings";
import { trackEvent } from "../lib/observability";

function SettingSwitch({
  checked,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  label: string;
  description: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-lg py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
      </span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-surface-muted"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [openCreateOnLaunch, setOpenCreateOnLaunch] = useState(
    () => quickCheckinSettings.openCreateOnLaunch,
  );
  const [preferCameraOnCheckin, setPreferCameraOnCheckin] = useState(
    () => quickCheckinSettings.preferCameraOnCheckin,
  );

  return (
    <Sheet title={t("profile.settings", "Cài đặt")} onClose={onClose}>
      <div className="flex flex-col gap-4 divide-y divide-border">
        <div className="flex flex-col">
          <SettingSwitch
            checked={openCreateOnLaunch}
            label={t("profile.openCreateOnLaunch", "Check-in luôn khi mở app")}
            description={t("profile.openCreateOnLaunchDesc", "Đi thẳng đến màn hình cắm cờ mỗi khi tải lại hoặc mở app.")}
            onChange={(checked) => {
              quickCheckinSettings.openCreateOnLaunch = checked;
              setOpenCreateOnLaunch(checked);
              trackEvent("profile_setting_change", { setting: "open_create_on_launch", enabled: checked });
            }}
          />
          <SettingSwitch
            checked={preferCameraOnCheckin}
            label={t("profile.preferCameraOnCheckin", "Ưu tiên chụp ảnh khi check-in")}
            description={t("profile.preferCameraOnCheckinDesc", "Tự mở camera một lần khi bắt đầu check-in.")}
            onChange={(checked) => {
              quickCheckinSettings.preferCameraOnCheckin = checked;
              setPreferCameraOnCheckin(checked);
              trackEvent("profile_setting_change", { setting: "prefer_camera_on_checkin", enabled: checked });
            }}
          />
          
          <div className="flex w-full items-center justify-between py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">{t("profile.language", "Ngôn ngữ")}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{t("profile.languageDesc", "Thay đổi ngôn ngữ hiển thị của ứng dụng.")}</span>
            </span>
            <select
              value={i18n.language.startsWith("vi") ? "vi" : "en"}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
            >
              <option value="vi">{t("profile.vi", "Tiếng Việt")}</option>
              <option value="en">{t("profile.en", "English")}</option>
            </select>
          </div>
        </div>
        <div className="pt-4">
          <p className="mb-2 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t("profile.integrations", "Tích hợp dịch vụ")}</p>
          <DriveConnectCard />
        </div>
      </div>
    </Sheet>
  );
}

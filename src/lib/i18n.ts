import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

const resources = {
  vi: {
    translation: {
      bottomNav: {
        map: "Bản đồ",
        discover: "Khám phá",
        create: "Tạo mới",
        aiPlan: "AI Plan",
        leaderboard: "Bảng XH",
        profile: "Cá nhân",
      },
      profile: {
        title: "Cá nhân",
        editProfile: "Sửa hồ sơ",
        badges: "Danh hiệu",
        viewAll: "Xem tất cả",
        leaderboard: "Bảng xếp hạng",
        leaderboardDesc: "Xem thứ hạng XP của bạn",
        rank: "Hạng",
        points: "điểm",
        settings: "Cài đặt",
        openCreateOnLaunch: "Check-in luôn khi mở app",
        openCreateOnLaunchDesc: "Đi thẳng đến màn hình cắm cờ mỗi khi tải lại hoặc mở app.",
        preferCameraOnCheckin: "Ưu tiên chụp ảnh khi check-in",
        preferCameraOnCheckinDesc: "Tự mở camera một lần khi bắt đầu check-in.",
        language: "Ngôn ngữ",
        languageDesc: "Chọn ngôn ngữ hiển thị",
        vi: "Tiếng Việt",
        en: "Tiếng Anh",
        logout: "Đăng xuất",
        level: "Cấp độ hiện tại",
        xpToNext: "Còn {{count}} XP nữa để lên cấp {{level}}",
        maxLevel: "Bạn đã đạt cấp tối đa! 🏆",
        totalXpLabel: "TỔNG XP",
        checkpointCountLabel: "SỐ CỜ",
        journeyCountLabel: "HÀNH TRÌNH",
        levelLabel: "CẤP",
      },
    },
  },
  en: {
    translation: {
      bottomNav: {
        map: "Map",
        discover: "Discover",
        create: "Create",
        aiPlan: "AI Plan",
        leaderboard: "Leader Board",
        profile: "Profile",
      },
      profile: {
        title: "Profile",
        editProfile: "Edit Profile",
        badges: "Badges",
        viewAll: "View all",
        leaderboard: "Leaderboard",
        leaderboardDesc: "View your XP ranking",
        rank: "Rank",
        points: "pts",
        settings: "Settings",
        openCreateOnLaunch: "Open check-in on startup",
        openCreateOnLaunchDesc: "Go straight to check-in screen when launching or reloading.",
        preferCameraOnCheckin: "Prefer camera on check-in",
        preferCameraOnCheckinDesc: "Automatically open the camera once when checking in.",
        language: "Language",
        languageDesc: "Select display language",
        vi: "Vietnamese",
        en: "English",
        logout: "Log Out",
        level: "Current Level",
        xpToNext: "{{count}} XP left to level {{level}}",
        maxLevel: "You have reached max level! 🏆",
        totalXpLabel: "TOTAL XP",
        checkpointCountLabel: "CHECKPOINTS",
        journeyCountLabel: "JOURNEYS",
        levelLabel: "LEVEL",
      },
    },
  },
};

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "vi",
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
  });

export default i18n;

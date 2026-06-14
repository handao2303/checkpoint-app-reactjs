import {
  defineConfig,
  minimal2023Preset,
  createAppleSplashScreens,
} from "@vite-pwa/assets-generator/config";

// Generates favicons, Android icons (transparent + maskable), Apple touch icons,
// and iOS launch (splash) screens from a single source, and injects the matching
// <link> tags into index.html at build. iOS needs opaque apple icons and splash
// screens — both get the brand background so there are no black corners / white
// launch flash.
const BG = "#FAF7F2"; // brand background_color

export default defineConfig({
  headLinkOptions: { preset: "2023" },
  preset: {
    ...minimal2023Preset,
    // Opaque background so the home-screen icon has no transparent/black corners.
    apple: {
      ...minimal2023Preset.apple,
      resizeOptions: { ...minimal2023Preset.apple.resizeOptions, background: BG },
    },
    appleSplashScreens: createAppleSplashScreens({
      padding: 0.3,
      resizeOptions: { fit: "contain", background: BG },
      darkResizeOptions: { fit: "contain", background: "#15110D" },
      linkMediaOptions: { log: true, addMediaScreen: true, basePath: "/", xhtml: true },
    }),
  },
  images: ["public/icon-512.png"],
});

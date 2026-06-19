import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // Force all maplibre code into ONE stably-named chunk. Otherwise Rollup
        // splits it into two "maplibre-gl" chunks and one ends up referenced as
        // "gl-<hash>.js" while the file is emitted as "maplibre-gl-<hash>.js" —
        // a dangling reference that 404s in production and kills the map.
        manualChunks(id) {
          if (id.includes("maplibre-gl") || id.includes("react-map-gl")) {
            return "maplibre";
          }
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // "autoUpdate" so the service worker automatically updates in the background.
      // Along with a controllerchange listener, this forces the page to reload
      // to pick up the latest deploy immediately.
      registerType: "autoUpdate",
      // We register the SW ourselves in PWAUpdatePrompt (virtual:pwa-register),
      // so don't also auto-inject a registration script.
      injectRegister: false,
      includeAssets: ["logo_c.png"],
      // Generate iOS/Android icons + iOS splash screens and inject their <link>
      // tags (see pwa-assets.config.ts).
      pwaAssets: { config: true },
      workbox: {
        // Drop the previous precache and take control immediately after a deploy
        // so clients stop requesting old (now-missing) chunk hashes. This only
        // touches THIS app's precache — it does NOT interfere with a separate
        // Firebase Cloud Messaging service worker added later.
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        // Never answer asset requests with the SPA fallback HTML — a missing
        // chunk must fail as a real network error, not a text/html response.
        navigateFallbackDenylist: [/^\/assets\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.origin === "https://zngdcfoeklogvjphhjkp.supabase.co" &&
              url.pathname.startsWith("/storage/v1/object/public/checkpoint-images/"),
            handler: "CacheFirst",
            options: {
              cacheName: "checkpoint-supabase-images-v1",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 365 * 24 * 60 * 60,
              },
              cacheableResponse: {
                // Cross-origin <img> requests can be opaque (status 0).
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      manifest: {
        id: "/",
        name: "Checkpoint",
        short_name: "Checkpoint",
        description: "Khám phá thế giới, lưu dấu hành trình",
        lang: "vi",
        dir: "ltr",
        theme_color: "#F4511E",
        background_color: "#FAF7F2",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        // Reuse the running PWA window for in-scope links (e.g. shared /c/:id),
        // and let Android Chrome capture those links into the installed app.
        launch_handler: { client_mode: ["navigate-existing", "auto"] },
        handle_links: "preferred",
        categories: ["travel", "social", "lifestyle"],
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});

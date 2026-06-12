import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server:{allowedHosts:['myapp.nport.link'],host: true, // Tương đương với --host
    port: 5173,
    // Thêm đoạn cấu hình hmr này vào:
    hmr: {
      clientPort: 5173,
    },},
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
      registerType: "autoUpdate",
      includeAssets: ["pin.svg", "apple-touch-icon.png"],
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

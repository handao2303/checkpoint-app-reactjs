# Checkpoint — Web (Vite + React PWA)

Frontend SPA for the Checkpoint travel app. Talks to the Go backend (`../backend`).
Design tokens come from `../design/tokens` and are baked into `src/index.css`.

## Stack

- **Vite + React 19 + TypeScript**
- **Tailwind CSS v4** (CSS-first, tokens via `@theme` in `src/index.css`)
- **React Router v7** — 5-tab bottom nav (Map · Discover · Create · AI Plan · Profile)
- **vite-plugin-pwa** — installable PWA
- **Cloudflare** deploy via Wrangler static assets (`wrangler.jsonc`)

## Develop

```bash
npm install
npm run dev          # http://localhost:5173
npm run typecheck    # tsc --noEmit
npm run build        # -> dist/
```

## Deploy to Cloudflare

```bash
npm run deploy       # builds + wrangler deploy (Workers static assets, SPA fallback)
# or connect the repo in the Cloudflare dashboard (build: `npm run build`, output: `dist`)
```

## TODO

- Wire the remaining pages (Map/Discover/Create/AIPlan) to the backend API — auth + Profile already done.
- Replace `ImagePlaceholder` with real images / a map library (Mapbox GL).

## Structure

```
src/
├── main.tsx            router + root
├── App.tsx             routes
├── index.css           Tailwind v4 + design tokens
├── lib/cn.ts           className helper
├── components/
│   ├── AppLayout.tsx   header + <Outlet/> + bottom nav
│   ├── BottomNav.tsx   5 tabs
│   └── ui/             Button, Chip, XPBadge, Card, ImagePlaceholder
└── pages/              MapPage, DiscoverPage, CreatePage, AIPlanPage, ProfilePage
```

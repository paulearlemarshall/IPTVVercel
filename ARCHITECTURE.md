# IPTVVercel Architecture

> Port of the Electron-based IPTV Player to a serverless web application built on Vercel's native stack.

---

## Technology Stack

| Layer | Choice | Rationale |
|---|---|---|
| **Framework** | Next.js 15 (App Router) | Vercel-native; React Server Components; API routes in the same project |
| **Language** | TypeScript | Type safety, Vercel ecosystem standard |
| **Database** | Neon (serverless Postgres) | via `@vercel/postgres` SDK; same facility as the Vercel Postgres integration |
| **ORM / Query** | Drizzle | Lightweight, no code-gen, works with edge runtimes, Vercel-native |
| **Auth / Secrets** | Vercel Environment Variables + Vercel Secrets | Username & password stored per-deployment; never in the client |
| **Video Player** | HTML5 `<video>` + `hls.js` + `mpegts.js` | Already in the existing codebase; replaces VLC/Electron |
| **Deployment** | Vercel (`vercel deploy`) | Serverless functions for API, static assets on edge CDN |
| **HTTP Client** | `fetch` (built-in) | Replaces `axios`; no extra dependency |
| **UI** | React 19 + Tailwind CSS 4 | Vercel ecosystem default; light/dark themes |

### Features That Do Not Port

| Feature | Reason |
|---|---|
| **Launch VLC** | Desktop-only; replaced by embedded player |
| **Chromecast** | Requires local network discovery & proxy server; not feasible in serverless |
| **FFmpeg transcoding** | No local binaries; no mountable filesystem |
| **Stress test / Speed test** | Requires FFmpeg subprocess on a local machine |
| **Local image caching** | No writeable filesystem on Vercel; rely on CDN and `<img>` native caching |
| **Download to disk** | Browser downloads replace Electron `downloadURL` |

---

## Directory Structure

```
IPTVVercel/
├── app/
│   ├── layout.tsx            # Root layout, providers, theme
│   ├── page.tsx              # Main SPA entry point
│   ├── api/
│   │   ├── config/route.ts   # CRUD profiles + settings (Neon)
│   │   ├── xc-proxy/route.ts # XC API proxy (serverless function)
│   │   └── auth/route.ts     # Verify credentials against XC server
│   └── providers.tsx          # React context providers
├── components/
│   ├── VideoPlayer.tsx       # Embedded HLS/TS/MP4 player (ported from VideoPlayer.jsx)
│   ├── Header.tsx            # Search, section tabs, filters (ported)
│   ├── Sidebar.tsx           # Category tree (ported)
│   ├── StreamCard.tsx        # Tile with logo, plot, favorites (ported)
│   ├── CachedImage.tsx       # Lazy-loaded <img> (simplified — no disk cache)
│   ├── ProfileManager.tsx    # CRUD profiles => Neon API (ported, IPC removed)
│   ├── AccountModal.tsx      # XC account info display (ported)
│   ├── ContextMenu.tsx       # Right-click metadata (ported)
│   ├── StarRating.tsx        # Fractional star display (ported)
│   └── FlipBookView.tsx      # Swiper-based carousel (ported)
├── hooks/
│   ├── useXCApi.ts           # Fetch wrapper calling /api/xc-proxy (replaces IPC)
│   ├── useFavorites.ts       # Persisted to Neon via API
│   ├── usePlayer.ts          # Sets currentStream for embedded player
│   ├── useFilteredStreams.ts # Client-side search/filter (unchanged)
│   ├── useGroupedCategories.ts # Category grouping (unchanged)
│   └── useSettings.ts        # Profile/settings from Neon API
├── lib/
│   ├── db.ts                 # Drizzle client + schema
│   ├── schema.ts             # Neon tables: profiles, favorites
│   └── xc.ts                 # URL builders (ported from utils/xc.js)
├── public/                   # Static assets
├── drizzle.config.ts
├── next.config.ts
├── tailwind.config.ts
├── package.json
├── .env.example              # NEON_DATABASE_URL, XC_USERNAME, XC_PASSWORD
└── ARCHITECTURE.md
```

---

## Data Store — Neon PostgreSQL

### Tables

**`profiles`**

| Column | Type | Notes |
|---|---|---|
| `id` | `text PK` | Client-generated UUID |
| `name` | `text` | Display name |
| `server_url` | `text` | Base XC server URL |
| `username` | `text` | XC username |
| `password` | `text` | XC password |
| `favorites` | `jsonb` | Array of stream IDs `["123","456"]` |
| `created_at` | `timestamptz` | |

The **username and password** are **never** stored in localStorage, sessionStorage, or client state. They are fetched server-side in `GET /api/config` and stored only in the serverless function's request-scoped memory. The `password` column is encrypted at rest via Neon's built-in encryption.

### Environment Variables (Vercel Secrets)

```
NEON_DATABASE_URL=postgres://...
```

These are set in the Vercel dashboard and never committed. The `.env.example` file documents the variable names only.

---

## Data Flow

### Authentication & Profile Selection

```
1. User lands on page
2. GET /api/config returns profile list (server-side, DB-backed)
   - Server decrypts/reads username+password from DB row
   - Returns profile metadata (NEVER password to client)
3. User selects a profile
4. POST /api/auth sends { profileId, serverUrl }
   - Serverless function reads credentials from Neon
   - Proxies a lightweight XC API ping to verify
   - Returns { valid: boolean, accountInfo }
5. Client stores profileId + serverUrl in React state (session-only)
```

### Stream Catalog Browsing

```
Client => GET /api/xc-proxy?action=get_live_categories&profileId=...
        => Serverless reads credentials from Neon
        => Serverless proxies request to XC API server
        => Returns JSON to client (via edge cache, 24h TTL)
```

All XC API requests go through `/api/xc-proxy` so credentials never leave the server. The proxy is a Vercel serverless function with an in-memory LRU cache.

### Video Playback

```
1. User double-clicks a StreamCard
2. Client constructs final stream URL from profile + stream metadata:
     `${serverUrl}/${username}/${password}/${id}.ts`
3. This URL can be direct (since it's already a web-streamable URL)
   - the embedded VideoPlayer component handles it via <video> + hls.js
4. No IPC; no VLC; no Chromecast
```

---

## Per-File Porting Notes

### Backend (moved to Next.js API routes)

| Old File | New File | Changes |
|---|---|---|
| `main.js` | -- | **Eliminated.** Electron lifecycle replaced by Next.js app lifecycle |
| `preload.js` | -- | **Eliminated.** IPC bridge replaced by `fetch()` to `/api/*` |
| `ipcLoader.js` | -- | **Eliminated.** Registration of handlers replaced by route files |
| `pathUtils.js` | -- | **Eliminated.** No local filesystem paths needed |
| `errorLogger.js` | -- | **Eliminated.** Vercel logs + Sentry optional |
| `xcApiProxy.js` | `app/api/xc-proxy/route.ts` | Same proxy logic, but runs as serverless function. Cache uses runtime memory (limited, acceptable per-invocation) |
| `configManager.js` | `app/api/config/route.ts` | INI file replaced by Neon `profiles` table. `select-vlc-path`/`select-ffmpeg-path` dropped |
| `imageManager.js` | -- | **Eliminated.** No local image cache. Browser `<img>` handles caching via `Cache-Control` |
| `vlcManager.js` | -- | **Eliminated.** VLC launching replaced by embedded player |
| `downloadManager.js` | -- | **Eliminated.** Browser download via `<a download>` or `URL.createObjectURL` |
| `chromecastManager.js` | -- | **Eliminated.** Chromecast requires local network discovery |
| `chromecastProxy.js` | -- | **Eliminated.** |
| `chromecastTranscoder.js` | -- | **Eliminated.** FFmpeg not available |
| `ffmpegDownloader.js` | -- | **Eliminated.** |
| `stressTestManager.js` | -- | **Eliminated.** |
| `speedTestManager.js` | -- | **Eliminated.** |

### Frontend (ported with minimal changes)

| Old File | New File | Changes |
|---|---|---|
| `src/main.jsx` | `app/layout.tsx` | React root => Next.js root layout |
| `src/App.jsx` | `app/page.tsx` | App component. Remove `playerMode` state (only `'internal'` now). Remove IPC calls, replace with `fetch()`. Remove Chromecast/StressTest/SpeedTest UI |
| `src/styles.css` | `app/globals.css` | Tailwind replaces custom CSS (though we retain the theme variables) |
| `VideoPlayer.jsx` | `components/VideoPlayer.tsx` | Same HLS/TS logic. Remove VLC button. Remove `stats` interval (optional). Drop `window.api` -- use direct `url` prop only |
| `Header.jsx` | `components/Header.tsx` | Remove VLC/Chromecast/FFmpeg/SpeedTest/StressTest buttons. Remove `handleVlcPathChange`, `handleFfmpegPathChange`, `castDevices`, `playerMode` props |
| `Sidebar.jsx` | `components/Sidebar.tsx` | **No change needed.** Pure UI |
| `StreamCard.jsx` | `components/StreamCard.tsx` | **No change needed.** Pure UI |
| `CachedImage.jsx` | `components/CachedImage.tsx` | Simplify: remove `cacheMap`, `window.api.checkImageCache`, `window.api.cacheImage`. Just lazy-load `<img>` |
| `ProfileManager.jsx` | `components/ProfileManager.tsx` | Replace `window.api.config.load/save` with `fetch('/api/config')`. Remove VLC path & FFmpeg path |
| `AccountModal.jsx` | `components/AccountModal.tsx` | **No change needed.** Pure UI |
| `ContextMenu.jsx` | `components/ContextMenu.tsx` | **No change needed.** Pure UI (with API call to fetch metadata) |
| `StarRating.jsx` | `components/StarRating.tsx` | **No change needed.** Pure UI |
| `FlipBookView.jsx` | `components/FlipBookView.tsx` | **No change needed.** Pure UI |
| `DownloadManagerUI.jsx` | -- | **Eliminated.** No server-side downloads |
| `TranscoderSettingsModal.jsx` | -- | **Eliminated.** No FFmpeg |
| `StressTestMonitor.jsx` | -- | **Eliminated.** No FFmpeg |
| `SpeedTestModal.jsx` | -- | **Eliminated.** |

### Hooks

| Old File | New File | Changes |
|---|---|---|
| `useXCApi.js` | `hooks/useXCApi.ts` | Replace `window.api.xcApi(params)` with `fetch('/api/xc-proxy', { body: JSON.stringify(params) })`. Remove `setImageCacheMap` |
| `useFavorites.js` | `hooks/useFavorites.ts` | Replace `window.api.config.load/save` with `fetch('/api/config', { method: 'PATCH', body: ... })` |
| `usePlayer.js` | `hooks/usePlayer.ts` | **Eliminate Chromecast/VLC branches.** Only `'internal'` mode remains. Sets `currentStream` state, `playStream` constructs URL and sets state |
| `useDownloadManager.js` | -- | **Eliminated.** |
| `useSettings.js` | `hooks/useSettings.ts` | Replace `window.api.config.load/save` with `fetch('/api/config')`. Remove VLC/FFmpeg path handlers |
| `useUIState.js` | `hooks/useUIState.ts` | Remove `showDownloadManager`, `showTranscoderSettings`. Keep tile size, flip book, plot toggle, image cache map (simplified) |
| `useSearchState.js` | `hooks/useSearchState.ts` | **No change needed.** |
| `useContextMenu.js` | `hooks/useContextMenu.ts` | Replace `window.api.xcApi(params)` with `fetch('/api/xc-proxy')` |
| `useChromecast.js` | -- | **Eliminated.** |
| `useTestModes.js` | -- | **Eliminated.** |
| `useFilteredStreams.js` | `hooks/useFilteredStreams.ts` | **No change needed.** Pure computation |
| `useGroupedCategories.js` | `hooks/useGroupedCategories.ts` | **No change needed.** Pure computation |
| `useIntersectionObserver.js` | `hooks/useIntersectionObserver.ts` | **No change needed.** Standard hook |

### Utils

| Old File | New File | Changes |
|---|---|---|
| `src/utils/xc.js` | `lib/xc.ts` | Same URL builders. Add a `constructStreamUrl(stream, type, profile)` that embeds credentials server-side (or we accept the stream URL has credentials inline, as the XC API always does) |

---

## Security

1. **Credentials live in Neon**, fetched server-side per-request
2. **XC API proxy** runs only in serverless functions; client never sees the password
3. **Stream URLs** do contain `username:password@host` -- this is the XC API protocol. These URLs are constructed client-side from `profile.password` which is stored in React state only while the session is active. Alternatives:
   - Re-proxy all stream bytes through the serverless function (high bandwidth cost)
   - Accept the XC protocol's URL-embedded credentials as a design constraint
4. **No secrets** in `localStorage`, cookies, or client-side bundles
5. **`.env.example`** documents every required variable without real values

---

## Deployment Pipeline

```
1. git push => Vercel auto-deploy
2. Set NEON_DATABASE_URL in Vercel dashboard
3. Run drizzle migrations: `npx drizzle-kit push`
4. Production URL: iptv.vercel.app (or custom domain)
```

No build step beyond `next build` (standard Vercel flow).

---

## State Architecture (React)

```
                            +------------------+
                            |   page.tsx (App)  |
                            +------+-----------+
                   +---------------+-------------------+
                   v               v                   v
           useXCApi        useFilteredStreams    usePlayer
         (categories,      (search, sort,       (currentStream,
           streams,          pagination)          playStream,
           metadata)                               closePlayer)
                   |                             |
                   |                             v
                   |                     <VideoPlayer />
                   |
                   v
       +---------------------------+
       | <Sidebar>   <StreamCard>*  |
       +---------------------------+
```

All state lives in the `page.tsx` component tree. There is no global store -- React hooks and prop drilling suffice for this SPA. If complexity grows, add Zustand or React Context (but the current design does not warrant it).

---

## Feature Inventory (Ported vs Dropped)

| Feature | Ported | Replacement |
|---|---|---|
| Browse Live/VOD/Series | ✓ | Same |
| Category sidebar | ✓ | Same |
| Search & filter | ✓ | Same |
| Favorites (star) | ✓ | Neon-persisted |
| Metadata display | ✓ | Same via XC API |
| FlipBook carousel | ✓ | Same |
| Right-click context menu | ✓ | Same |
| Embedded video player | ✓ | hls.js + mpegts.js (already exists!) |
| Profile management | ✓ | Neon CRUD via API |
| Account info modal | ✓ | Same |
| 24h XC API cache | ✓ | Vercel Edge Cache or in-memory LRU |
| Progressive rendering | ✓ | Same |
| Launch VLC | ✗ | Embedded player replaces |
| Chromecast | ✗ | Not feasible serverless |
| FFmpeg transcoding | ✗ | Not available |
| Download to disk | ✗ | Browser `download` attribute |
| Stress test | ✗ | Not available |
| Speed test | ✗ | Not available |
| Local image cache | ✗ | Browser HTTP cache |
| Section accent colors | ✓ | Same (CSS custom property) |

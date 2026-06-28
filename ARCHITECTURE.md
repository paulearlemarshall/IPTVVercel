# IPTVVercel Architecture

Internal design reference for the current system. For setup/operation see [README.md](./README.md).

> Origins: this app began as a port of an Electron IPTV player to a Vercel-native stack. Desktop-only features (VLC process launch, Chromecast, FFmpeg transcoding, disk caching, stress/speed tests) were dropped; the embedded player, a serverless XC proxy, and a Postgres-backed catalogue cache replace them.

---

## Technology

| Layer | Choice |
|---|---|
| Framework | Next.js 15 App Router (RSC + route handlers) |
| Language | TypeScript |
| DB | Neon serverless PostgreSQL via Drizzle ORM (`@neondatabase/serverless` Pool) |
| Styling | Tailwind CSS 4 |
| Player | HTML5 `<video>` + `hls.js` + `mpegts.js` + `react-player` + `@ffmpeg/ffmpeg` (lazy) |
| Hosting | Vercel (route handlers as serverless functions, static assets on CDN) |

Path alias: `@/*` → repo root (`tsconfig.json`).

---

## Runtime boundaries

- **Browser (`app/page.tsx` + components/hooks):** UI state, filtering/sorting, calls to internal `/api/*` only. No credentials, no direct provider calls.
- **Server (`app/api/*` route handlers):** resolve secrets, talk to the XC provider, read/write Neon, normalize responses.

All client state lives in `page.tsx` and is prop-drilled; there is no global store (the app is small enough not to need one).

---

## Request / data flow

### Catalogue browsing
```
client → POST /api/xc-proxy { profileId, action, params, forceRefresh }
        → load profile row (Neon)
        → if cacheable & !forceRefresh: read Neon cache
             fresh  → return (record db_hit)
             stale/miss → fall through
        → resolveCredentials(profile)  [env secrets]
        → fetch XC player_api.php (10s timeout)
        → write full payload to Neon cache (batched, replace-on-refresh)  (record upstream)
        → return TRIMMED list payload to client
```
`runtime = "nodejs"`, `maxDuration = 60`. List responses (`get_live_streams`, `get_vod_streams`, `get_series`) are projected to a field allowlist to stay under Vercel's ~4.5 MB body limit; the **full** object is still cached in `xc_streams.raw`.

### Playback
```
client double-click → POST /api/stream-url { profileId, stream, section }
        → build  {base}/{movie|series}/{user}/{pass}/{id}.{ext}   (server-side creds)
        → also return proxyUrl = /api/playback?profileId&section&streamId&ext
client → VideoPlayer picks an engine (Auto prefers proxy when proxyUrl present)
        → /api/playback streams upstream bytes with Range passthrough (CORS workaround)
```

### Catalogue update (bulk)
`POST /api/catalog-update` (`maxDuration = 300`) streams NDJSON progress while it walks every category of a section, fetching and caching each. EN updates write a filtered subset with `replace: false`.

---

## Caching design (`lib/xc-db-cache.ts`)

Single persistent layer: **Neon**. (An earlier per-instance in-memory LRU was removed — it was bypassed by the DB-first read and didn't survive serverless instances.)

- **Cacheable actions:** category lists, stream lists, `get_vod_info`, `get_series_info`.
- **Freshness / TTL:** reads compare the newest row's `updated_at` against `XC_DB_CACHE_TTL_MS` (default 24h). Stale → treated as a miss → upstream refetch. Without this the catalogue was frozen at first-cache time.
- **Writes:** chunked multi-row upserts (`excluded.*`, 500/statement) instead of row-by-row.
- **Replace-on-refresh:** all rows in a write share one `now`; after upserting, rows for the key with an older `updated_at` (removed upstream) are deleted, so the cache mirrors the source. Controlled by `options.replace` (default true; EN catalogue updates pass false so a filtered subset doesn't delete non-EN rows).

### Metrics & logging
- `lib/metrics.ts`: durable `cache_metrics` counters (`db_hit`, `upstream`), incremented **fire-and-forget** off the hot path; surfaced by `/api/cache-stats` and the Stats modal.
- `lib/db-log.ts`: in-memory ring buffer of recent DB activity; only **writes and failures** are persisted to `db_activity_logs` (routine reads stay in memory to avoid write-amplification/unbounded growth).

---

## Credentials (`lib/credentials.ts`)

`resolveCredentials(profile)` returns `XC_USERNAME`/`XC_PASSWORD` env secrets first, profile columns as fallback. The default profile is seeded with **empty** credential columns, so the plaintext secret never lives in the DB. Used by every XC-calling route (`xc-proxy`, `stream-url`, `playback`, `auth`, `account-info`, `catalog-update`). `/api/config` GET never returns a password.

The constructed stream URL still embeds credentials (XC protocol) and is shown in the tooltip — an accepted constraint.

---

## Database schema (`lib/schema.ts`)

| Table | Key | Purpose |
|---|---|---|
| `profiles` | `id` | Profile: name, servers[], activeServerIndex, username/password (empty when env-driven), favorites |
| `xc_categories` | (profile, server, section, categoryId) | Cached category buckets |
| `xc_streams` | (profile, server, section, categoryId, streamId) | Cached per-category stream lists (`raw` = full object) |
| `xc_stream_metadata` | (profile, server, section, streamId) | Cached `get_vod_info`/`get_series_info` |
| `xc_series_seasons` | (profile, server, seriesId, seasonNumber) | Flattened series seasons |
| `xc_series_episodes` | (profile, server, seriesId, seasonNumber, episodeId) | Flattened series episodes |
| `xc_playback_results` | (profile, section, streamId, tech) | Per-stream engine success/failure + attempts |
| `cache_metrics` | `metric` | Durable cache meter counters |
| `db_activity_logs` | `id` | Persisted write/failure log entries |

All `xc_*` cache tables carry `updated_at` (drives TTL) and cascade-delete with the profile.

---

## Player engines (`components/VideoPlayer.tsx`)

`auto | native | react-player | hls | mpegts | proxy | transcode`

- **Auto** → `proxy` when a proxyUrl exists, else by extension (`.m3u8`→hls, `.ts`→mpegts, mp4/webm/…→native, else react-player).
- **proxy** plays the same-origin `/api/playback` URL (Range passthrough) for CORS/Range-blocked hosts — the default.
- **transcode (MKV→MP4)** lazy-loads ffmpeg.wasm (single-thread core from CDN, no COOP/COEP), downloads via the proxy, remuxes `-c:v copy -c:a aac -movflags +faststart`, plays the blob. Best-effort; large/HEVC files may exhaust memory.
- Success/failure per engine is posted to `/api/playback-result`. `Try Next Engine`, VLC scheme links, and M3U download are provided.

---

## Client behaviour notes

- **Sorting:** `useFilteredStreams` applies a deterministic total order (year desc → name → id) so a force-refresh never reshuffles unchanged content.
- **Filtering:** EN allowlist (categories) + non-English markers (streams) + a year dropdown; synthetic `|EN| All VOD` merges EN VOD categories client-side and dedupes by `stream_id`.
- **Hover previews:** gated by `useHasHover` (`hover:hover`/`pointer:fine`) so touch devices don't trigger them; cancel/schedule dismiss pattern.
- **Images:** `TileImage` lazy-loads via IntersectionObserver (viewport + 300px), remembers failed URLs session-wide to avoid re-requests, and shows a placeholder.
- **Mobile:** sidebar is a slide-in drawer under `md`; header wraps; cards use poster aspect ratios (2:3 VOD/series, 16:9 live).

---

## Key trade-offs / known gaps

- **No app-level auth** — the deployment is open to anyone with the URL (uses your subscription + Vercel bandwidth).
- **Proxy-by-default playback** tunnels video through the function — broad compatibility, high bandwidth.
- **Response size** — list trimming mitigates but very large categories still approach the 4.5 MB limit.
- **Multi-profile** is half-built (UI always uses the first profile).
- **Best-effort** metrics/logging and in-browser transcoding.

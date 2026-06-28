# IPTVVercel

IPTVVercel is a Next.js IPTV browser for Xtream Codes (XC) style providers. It runs on Vercel, caches the provider catalogue in Neon PostgreSQL through Drizzle, plays streams in an in-browser player, and keeps provider credentials on the server side.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the internal design (request flow, cache layers, schema, trade-offs).

## Features

- Browse **Live / VOD / Series** categories from configured IPTV servers, grouped and alphabetically sorted in a sidebar.
- **Catalogue caching** in Neon: categories, per-category stream lists, and VOD/series metadata are cached after the first provider fetch, with a freshness TTL and replace-on-refresh.
- **Feeds sorted by year, newest first** (deterministic total ordering, so refreshing never reshuffles unchanged content).
- **Year filter** dropdown (All Years + last 10 years) and an **EN** toggle, including a synthetic `|EN| All VOD` category that aggregates EN VOD buckets.
- **Hover previews** of metadata and the stream URL (desktop only — suppressed on touch devices).
- **Series window** with backdrop art, season groups, and 16:9 episode tiles; plays individual episodes.
- **In-browser player** with a selectable engine: Auto, Native, ReactPlayer, HLS.js, MPEG-TS (`mpegts.js`), same-origin Proxy Native, and **MKV→MP4** in-browser conversion (ffmpeg.wasm). Plus `Try Next Engine`, VLC launch links, and M3U download.
- **Catalogue update jobs** (All / VOD / Live / Series) with streamed progress in the header.
- **Mobile-friendly**: collapsible sidebar drawer, wrapping header, poster-aspect cards, viewport-batched image loading.
- **Account modal**, **DB activity log**, and a **cache-stats meter** (DB hits vs. upstream calls). Light/dark themes.

## Stack

- Next.js 15 (App Router), React 19, TypeScript
- Tailwind CSS 4
- Drizzle ORM + Neon serverless PostgreSQL (`@neondatabase/serverless`)
- `hls.js`, `mpegts.js`, `react-player`, `@ffmpeg/ffmpeg` (lazy-loaded)
- Deployed on Vercel

## Prerequisites

- Node.js 20+
- A Neon (or other PostgreSQL) database
- Xtream Codes provider credentials and at least one server URL

## Setup

```bash
npm ci                 # install (uses package-lock.json)
cp .env.example .env.local
# edit .env.local — see Environment below
npm run db:push        # apply the Drizzle schema to DATABASE_URL
npm run dev            # http://localhost:3000
```

Other commands:

```bash
npm run build          # production build
npm run start          # serve the production build
npm run lint           # Next.js lint
npm run db:generate    # generate SQL migrations from lib/schema.ts
npm run db:studio      # Drizzle Studio
```

There is no separate test suite; validate with `npx tsc --noEmit` and `npm run build`.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Neon/PostgreSQL connection string used by Drizzle and all API routes. |
| `XC_USERNAME` | yes* | XC account username. **Source of truth at runtime** — resolved per request. |
| `XC_PASSWORD` | yes* | XC account password. Resolved per request; never stored in the DB. |
| `XC_SERVER_1`…`XC_SERVER_10` | yes* | Provider base URLs. `XC_SERVER_1` is required to seed the default profile; 2–10 are optional extra endpoints. |
| `XC_DB_CACHE_TTL_MS` | no | Catalogue cache freshness in ms (default `86400000` = 24h). |

\* Credentials and server URLs live as Vercel environment secrets. On first load, if no profile exists, a `default` profile row is created from these (the username/password columns are stored **empty** — the secrets are the runtime source). See [Security](#security).

Set the same variables in the Vercel dashboard for deployed environments. After changing schema (`lib/schema.ts`), run `npm run db:push` against the target database.

## How it works (summary)

- The browser never sees provider credentials. All XC API calls go through `POST /api/xc-proxy`; stream URLs are built server-side by `POST /api/stream-url` (the resulting URL does embed credentials per the XC protocol, and is shown in the tooltip).
- `xc-proxy` serves from the **Neon cache** when fresh, otherwise fetches upstream, writes the full payload to Neon (batched, replace-on-refresh), and returns a trimmed list payload.
- Double-clicking a category (or the Update buttons) forces a refresh that bypasses the cache and re-persists.

Full details in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Playback

The top bar shows the active engine. `Auto` prefers **Proxy Native** whenever a same-origin playback URL can be built (broadest success with hosts that block CORS/Range); otherwise it picks HLS.js for `.m3u8`, MPEG-TS for `.ts`/`output=ts`, native video for common file extensions, and ReactPlayer as a catch-all.

Browsers can't play the **MKV** container natively. The **MKV→MP4** engine downloads the file (via the same-origin proxy) and remuxes it client-side with ffmpeg.wasm (single-threaded core from CDN, so no COOP/COEP headers needed). It's best for smaller H.264 VOD; large or HEVC/4K files may exceed browser memory — use VLC for those. The libraries are lazy-loaded, so the main bundle is unaffected.

## Catalogue cache

Neon tables back the proxy: category buckets, per-category stream lists, VOD/series metadata, and series seasons/episodes (flattened, with the full raw payload retained). On a request the proxy checks Neon first for the active `(profile, server, section, …)`; fresh rows are returned, stale (older than `XC_DB_CACHE_TTL_MS`) or missing rows trigger an upstream fetch that re-persists. Writes are batched and **replace-on-refresh** removes rows that disappeared upstream. EN-only catalogue updates write a filtered subset without deleting non-EN rows.

The **DB Log** button shows recent cache activity. Routine successful reads are kept in-memory only; writes and failures are persisted to `db_activity_logs`. The **Stats** button shows a durable meter (DB cache hits vs. upstream API calls) from the `cache_metrics` table.

## EN filter

On by default. Categories are matched by an allowlist of prefixes (`EN`, `UK`, `US`, `GB`, `CA`, `MULTI`, `NETFLIX`, `APPLE+`, `DISNEY+`, `4K`, `24/7`, `BEIN`, `NZ`, `AU`, …); streams with obvious non-English markers (`SWEDEN`, `NORWAY`, `DEUTSCH`, `FRENCH`, `ITALIAN`, `SPANISH`, …) are hidden. For VOD a virtual `|EN| All VOD` category aggregates matching EN VOD categories and dedupes by `stream_id`.

## Repository structure

```
app/
  layout.tsx              Root layout, theme
  page.tsx                Main SPA: state, header, sidebar, grid, hover, modals
  api/
    config/               GET/POST/PATCH profiles (seeds default; never returns password)
    servers/              Lists XC_SERVER_n env entries
    auth/                 Verify XC credentials
    account-info/         XC account/status passthrough
    xc-proxy/             Cached XC API proxy (categories/streams/metadata)
    stream-url/           Build playable URL + proxy URL (server-side creds)
    playback/             Byte-range streaming proxy for CORS-blocked streams
    catalog-update/       Streamed bulk catalogue refresh (NDJSON progress)
    playback-result/      Record per-stream engine success/failure
    cache-stats/          Cache meter (db_hit vs upstream)
    db-log/               Read/clear DB activity log
components/               VideoPlayer, Sidebar, SeriesDetailModal, StreamTooltip,
                          TileImage, CatalogUpdateButtons, ServerSelector,
                          AccountModal, StatsModal, DbLogModal, Theme*
hooks/                    useXCApi, useFilteredStreams, useGroupedCategories, useHasHover
lib/                      db, schema, xc (URL builders), xc-db-cache, credentials,
                          metrics, db-log
drizzle/                  Generated migration output (when used locally)
```

## Deployment

1. Push to the repo; Vercel auto-deploys.
2. Set `DATABASE_URL`, `XC_USERNAME`, `XC_PASSWORD`, `XC_SERVER_n` (and optional `XC_DB_CACHE_TTL_MS`) in the Vercel dashboard.
3. Run `npm run db:push` against the production `DATABASE_URL` when the schema changes (e.g. the `cache_metrics` table).

## Security

- Provider credentials live **only as environment secrets** (`XC_USERNAME`/`XC_PASSWORD`) and are resolved per request in `lib/credentials.ts`. They are **not stored in the database** — the default profile's credential columns are empty, and `/api/config` never returns a password.
- All privileged work (DB access, XC calls, secret resolution) stays in API routes; the client only calls internal `/api/*` endpoints.
- The stream URL itself embeds credentials (XC protocol) and is shown in the tooltip — this is an accepted protocol constraint.
- Keep real values in `.env.local` / Vercel only. Never commit real credentials, database URLs, or local env files.

## Known limitations / caveats

- **No app authentication.** Any visitor to the deployment can browse and play (consuming your subscription and Vercel bandwidth). Add Vercel password protection or an auth layer if the URL is public.
- **Proxy-by-default playback** streams video bytes through the serverless function — convenient for CORS but bandwidth-heavy; prefer direct engines for large/long playback.
- **Response size:** very large categories approach Vercel's ~4.5 MB body limit; list payloads are trimmed to mitigate this.
- **Multi-profile is partial:** the UI uses the first profile; there is no profile switcher.
- Caches and the in-browser MKV conversion are best-effort; the cache meter may slightly undercount on cold serverless starts.

## Troubleshooting

- **Empty catalogue / errors:** confirm `DATABASE_URL` and `XC_*` env vars are set, the schema is pushed (`npm run db:push`), and the server URL is reachable. Use the DB Log and Stats buttons to see cache activity.
- **Stale catalogue:** double-click a category (or use Update) to force-refresh; entries auto-refresh after `XC_DB_CACHE_TTL_MS`.
- **Stream won't play:** try another engine or `Try Next Engine`; for MKV use MKV→MP4 or VLC.
- **Hydration/theme issues:** clear storage and hard-refresh; hover is intentionally disabled on touch devices.

# IPTVVercel

IPTVVercel is a Next.js IPTV browser app for Xtream Codes-style providers. It runs on Vercel, stores profile data in Neon PostgreSQL through Drizzle, and keeps provider credentials on the server side.

## Features

- Browse live, movie, and series categories from configured IPTV servers.
- Switch between configured server endpoints for the active profile.
- Cache live, VOD, and series catalogues in Neon after the first provider fetch.
- Preview stream metadata and stream URLs from the catalogue.
- Play streams in an embedded player with selectable playback technology:
  - Auto detection
  - Native browser video
  - ReactPlayer
  - HLS.js
  - MPEG-TS via `mpegts.js`
  - Same-origin proxy native playback for servers that block direct browser/CORS/Range playback
- Filter categories and streams with an EN toggle, including a synthetic `|EN| All VOD` category that aggregates EN VOD buckets.
- Open series in a full-screen series window with backdrop art, season groups, and episode titles.
- Light and dark theme support.

## Stack

- Next.js 15 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Drizzle ORM
- Neon serverless PostgreSQL
- Vercel deployment

## Setup

Install dependencies from the repository root:

```bash
npm ci
```

Create a local environment file:

```bash
cp .env.example .env.local
```

Set `DATABASE_URL` to a Neon/PostgreSQL connection string. To seed a default IPTV profile on first load, also set `XC_SERVER_1`, `XC_USERNAME`, and `XC_PASSWORD`. Add `XC_SERVER_2` through `XC_SERVER_10` if you want multiple server endpoints.

Apply the database schema:

```bash
npm run db:push
```

Start local development:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

## Playback Notes

The player has a technology selector in the top bar so the active engine is visible while testing streams. `Auto` prefers Proxy Native whenever the app can construct a same-origin playback URL. If a proxy URL is unavailable, `Auto` chooses HLS.js for `.m3u8`, MPEG-TS for `.ts` or `output=ts`, native browser video for common file extensions, and ReactPlayer otherwise.

`Proxy Native` is the default because it has the broadest success rate with IPTV hosts that block browser CORS or Range requests. The proxy reconstructs URLs from saved profile data and stream IDs instead of accepting arbitrary external URLs, forwards byte-range requests, asks the upstream with the browser user-agent, and returns inline video headers to the browser.

MKV playback still depends on the browser's container and codec support. If a browser cannot decode a given MKV file, switching engines may not overcome that container limitation without server-side transcoding.

## Catalogue Cache

The Xtream Codes proxy is backed by Neon tables for:

- Live, VOD, and series category buckets.
- Per-category stream lists.
- VOD and series metadata responses.
- Series seasons and episodes flattened by season while retaining the full raw payloads.

When the app needs categories, streams, or metadata, it checks Neon first for the active profile and server URL. If records exist, it returns those rows. If records are missing, it calls the provider API, stores the full response payloads in Neon, and returns the fresh data.

The top-right DB Log button shows recent database retrieve and upsert activity from the current server instance, including successes, failures, tables, actions, row counts, and cache hit/miss messages. The log is intentionally in memory so logging does not create more database writes while debugging database writes.

## EN Filter

The EN toggle is on by default. Category filtering uses an allowlist of prefixes such as `EN`, `UK`, `US`, `GB`, `CA`, `MULTI`, `NETFLIX`, `APPLE+`, `DISNEY+`, `4K`, `24/7`, `BEIN`, `NZ`, and `AU`. Stream filtering removes obvious non-English language markers such as `SWEDEN`, `NORWAY`, `DENMARK`, `FINLAND`, `DEUTSCH`, `FRENCH`, `ITALIAN`, and `SPANISH`.

For VOD, the app injects a virtual `|EN| All VOD` category when matching EN categories exist. Selecting it fetches every matching EN VOD category sequentially through the same DB-backed proxy path and deduplicates streams by `stream_id`.

## Repository Structure

- `app/` - Next.js pages and API routes.
- `components/` - UI components, including `VideoPlayer`.
- `hooks/` - Client data-fetching and filtering hooks.
- `lib/` - Database schema/client and Xtream Codes URL helpers.
- `drizzle/` - Generated migration output when used locally.

## Security

Keep real credentials in `.env.local` or Vercel environment variables only. Do not commit real IPTV credentials, database URLs, or generated environment files.

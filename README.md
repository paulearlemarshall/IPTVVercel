# IPTVVercel

IPTVVercel is a Next.js IPTV browser app for Xtream Codes-style providers. It runs on Vercel, stores profile data in Neon PostgreSQL through Drizzle, and keeps provider credentials on the server side.

## Features

- Browse live, movie, and series categories from configured IPTV servers.
- Switch between configured server endpoints for the active profile.
- Preview stream metadata and stream URLs from the catalogue.
- Play streams in an embedded player with selectable playback technology:
  - Auto detection
  - Native browser video
  - ReactPlayer
  - HLS.js
  - MPEG-TS via `mpegts.js`
  - Same-origin proxy native playback for servers that block direct browser/CORS/Range playback
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

The player has a technology selector in the top bar so the active engine is visible while testing streams. `Auto` chooses HLS.js for `.m3u8`, MPEG-TS for `.ts` or `output=ts`, native browser video for common file extensions, and ReactPlayer otherwise.

Use `Proxy Native` when direct MP4/VOD playback fails because the IPTV host blocks browser CORS or Range requests. The proxy reconstructs URLs from saved profile data and stream IDs instead of accepting arbitrary external URLs.

MKV playback still depends on the browser's container and codec support. If a browser cannot decode a given MKV file, switching engines may not overcome that container limitation without server-side transcoding.

## Repository Structure

- `app/` - Next.js pages and API routes.
- `components/` - UI components, including `VideoPlayer`.
- `hooks/` - Client data-fetching and filtering hooks.
- `lib/` - Database schema/client and Xtream Codes URL helpers.
- `drizzle/` - Generated migration output when used locally.

## Security

Keep real credentials in `.env.local` or Vercel environment variables only. Do not commit real IPTV credentials, database URLs, or generated environment files.

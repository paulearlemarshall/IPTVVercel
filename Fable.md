# Fable.md — Code Review & Build Guide

> Written 2026-07-02 by Claude (Fable 5) after a full code review of IPTVVercel.
> Audience: the next AI (or human) working on this codebase. Read this before
> ARCHITECTURE.md for the "why"; read ARCHITECTURE.md for the "what".

---

## 1. What this app is

A web-based IPTV player (Xtream Codes / XC API) ported from an Electron app to
Next.js on Vercel. Users browse Live/VOD/Series catalogues, hover for metadata
tooltips, and play streams in the browser through a multi-engine video player.

- **Frontend**: Next.js 15 App Router, React 19, TypeScript (strict), Tailwind 4
- **Backend**: Next.js API routes (Node runtime) acting as a credential-holding
  proxy in front of the XC provider
- **Database**: Neon Postgres via Drizzle ORM — used as a durable catalogue
  cache, playback-result log, and metrics store
- **Playback**: hls.js, mpegts.js (TS + FLV), native `<video>`, ReactPlayer,
  server-side range proxy, and ffmpeg.wasm in-browser MKV/AVI→MP4 remux

## 2. Build & run instructions

```bash
npm ci
cp .env.example .env.local
# Set DATABASE_URL, XC_USERNAME, XC_PASSWORD, and XC_SERVER_1 in .env.local.
npm run db:push      # only against an approved disposable/local database
npm run dev          # http://localhost:3000
npm run build        # production build — MUST pass before committing
npx tsc --noEmit     # strict type check — MUST pass before committing
```

Deployment is Vercel (project already linked). API routes use
`runtime = "nodejs"`; `/api/xc-proxy` sets `maxDuration = 60` because catalogue
refreshes can be slow.

**Verification protocol for changes**: `npx tsc --noEmit` + `npm run build`
minimum. For player changes, test against a real provider stream (there are no
mocks — the XC provider is external and credentialed).

## 3. Tech stack audit (2026-07-02)

| Package | Version | Status |
|---|---|---|
| next | 15.5.x | observed version; **Next 16 migration deferred** — see below |
| react / react-dom | 19.2.x | observed version |
| typescript | 6.0.x | observed version |
| tailwindcss | 4.3.x | observed version |
| drizzle-orm / drizzle-kit | 0.45 / 0.31 | observed version |
| hls.js | 1.6.x | observed version |
| mpegts.js | 1.8.x | observed version (also handles FLV) |
| react-player | 3.x | observed version (v3 API: `src` prop, not `url`) |
| @ffmpeg/ffmpeg | 0.12.x | observed version; core loaded from unpkg CDN at runtime |

**Next 16 migration (deferred, do deliberately):** run
`npx @next/codemod@latest upgrade` on a branch. Watch for: async request APIs
(`params`/`searchParams` as Promises — this app doesn't use dynamic route
params so impact is small), middleware changes (none used), and Turbopack
default. Nothing in this codebase is known-incompatible; it was deferred only
to avoid an untested major bump inside an unrelated change.

## 4. Architecture map (files that matter)

```
app/page.tsx                 # single-page UI orchestrator: sections, categories, grid, hover, player
app/api/xc-proxy/route.ts    # ALL catalogue traffic. DB cache read→upstream fetch→DB write. Timing headers.
app/api/stream-url/route.ts  # resolves a stream/episode to direct URL + /api/playback proxy URL
app/api/playback/route.ts    # server-side range-passthrough proxy (dodges CORS/Range/referrer blocks)
app/api/catalog-update/      # bulk refresh endpoints used by header buttons
lib/xc.ts                    # XC URL construction (player_api.php, /live|/movie|/series paths)
lib/xc-db-cache.ts           # Postgres cache: TTL staleness, chunked bulk upserts, replace-on-refresh
lib/credentials.ts           # resolves XC user/pass from Vercel env — NEVER store creds in DB/client
lib/schema.ts                # Drizzle tables: profiles, xc_categories, xc_streams, xc_stream_metadata,
                             #   xc_series_seasons, xc_series_episodes, playback results, cache_metrics, db log
hooks/useXCApi.ts            # client data layer: proxyRequest → /api/xc-proxy, in-memory metadata cache
components/VideoPlayer.tsx   # multi-engine player with auto-failover ladder (see §6)
components/ThemeToggle.tsx   # light/dark/system 3-way toggle; ThemeScript.tsx = pre-hydration class set
```

### Data-flow invariants (do not break)

1. **Raw credential fields and privileged XC API calls remain server-side.** The browser calls
   `/api/xc-proxy`, `/api/stream-url`, `/api/playback` with a `profileId`. The
   server resolves username/password from env (`lib/credentials.ts`). Direct
   stream URLs returned to the client DO embed credentials (unavoidable for
   VLC handoff and direct playback) — never log or persist those URLs.
2. **The DB is the only persistent cache.** No in-memory cache in the hot
   path (serverless instances don't share memory). `xc-db-cache.ts` enforces a
   TTL (`XC_DB_CACHE_TTL_MS`, default 24h): stale rows = cache miss = transparent
   upstream refetch. `forceRefresh: true` in the proxy body (wired to
   double-clicking a sidebar category) bypasses reads entirely.
3. **Cache writes are chunked bulk upserts** (500 rows/statement,
   `excluded.*` conflict updates) with replace-on-refresh deletes of rows not
   in the new snapshot. Never regress to per-row awaited inserts.
4. **List responses are trimmed** (`LIST_FIELDS` projection in xc-proxy) to
   stay under serverless body limits — the full raw objects live in
   `xc_streams.raw`. If the UI needs a new field on tiles, add it to
   `LIST_FIELDS`, don't remove the projection.

## 5. Review findings (2026-07-02) — and what was done

**Fixed in this pass:**
- `getArtwork()` in page.tsx had a fully duplicated poster branch → collapsed.
- `ThemeToggle` media-query listener captured the mount-time theme (stale
  closure): after switching to "system" the OS theme change wasn't tracked
  until reload → handler now reads `localStorage` live.
- No request timing existed → `/api/xc-proxy` now returns `x-cache-source`
  (`db` | `upstream`) and `x-duration-ms` headers on every response and logs
  `[xc-proxy] <action> source=… duration=…ms` in dev (or when `XC_DEBUG` is
  set). Check DevTools Network tab to see where time goes.
- VideoPlayer had no automatic failover and no FLV support → rewritten (§6).
- Client metadata now uses a profile-scoped 200-entry LRU cache, and live
  MPEG-TS/FLV playback enables latency chasing.
- Minor package updates applied (tailwind, lucide, @types/node, next patch).

**Known remaining debt (ranked):**
1. **No auth on API routes.** Anyone with the deployment URL can drive the
   proxy and use the account. `/api/auth` exists — verify it gates the app
   (middleware or per-route check) before treating this as production.
2. `useXCApi.fetchStreams` "All EN VOD" merge fetches categories sequentially;
   could be `Promise.allSettled` with a small concurrency cap (the DB cache
   makes repeat runs fast, so this is a cold-path issue only).
3. `page.tsx` is ~450 lines carrying all orchestration state; if it grows
   further, extract hover-tooltip logic into a `useHoverMetadata` hook.
4. ffmpeg core loads from unpkg CDN — self-host under `public/ffmpeg/` if the
   CDN becomes a reliability or privacy concern.

## 6. The video player (components/VideoPlayer.tsx)

The hardest problem in this app: IPTV providers serve wildly inconsistent
formats (raw TS, HLS, MP4, MKV with H.264 or HEVC, AVI, FLV), often with
broken CORS, no Range support, and referrer/UA checks.

### Engine inventory

| Engine | Library | Best for |
|---|---|---|
| `hls` | hls.js (worker on, retries tuned, media-error auto-recovery) | `.m3u8` playlists |
| `mpegts` | mpegts.js | raw `.ts` live channels |
| `flv` | mpegts.js (`type: "flv"`) | FLV streams |
| `native` | `<video src>` | MP4/WebM/MOV with browser codecs; Chromium can often demux MKV too |
| `proxy` | `<video src=/api/playback…>` | same as native but server-proxied — fixes CORS/Range/referrer blocks |
| `react-player` | react-player v3 | format sniffing / anything else |
| `transcode` | ffmpeg.wasm | MKV/AVI remux to MP4 in-browser (video copy, audio→AAC). Memory-bound; VLC is the escape hatch |

### Auto-failover ladder (the key mechanism)

`getLadder(url, proxyUrl, section)` returns an ordered engine list per source
shape. In **Auto** mode (default), any engine failure automatically advances
to the next rung — the user only sees an error after the whole ladder is
exhausted. Manual engine selection disables failover. Current ladders:

- `.m3u8` → hls, react-player, mpegts, native, proxy
- `.mkv`/`.avi` → proxy, native, transcode, react-player (transcode IS
  auto-attempted here because browsers genuinely can't demux these; it is
  deliberately excluded from every other ladder — too heavy to auto-run)
- `.flv` → flv, mpegts, proxy, react-player
- `.ts` / live → mpegts, hls, proxy, native, react-player
- mp4-family → proxy, native, react-player, hls
- unknown → react-player, hls, mpegts, proxy, native

("proxy" rungs are dropped when no proxyUrl exists, i.e. series tiles before
episode resolution.)

### Debugging playback

- The 🐛 button in the player header shows the per-engine attempt log:
  engine, outcome (trying/playing/failed), elapsed ms, failure messages.
- The same data goes to `console.debug` with a `[player]` prefix.
- Every success/failure is POSTed to `/api/playback-result` keyed by
  (profileId, section, streamId, tech) — the DB accumulates which engine works
  per stream. **Unexploited opportunity**: read this table back to reorder the
  ladder per-stream ("engine memory").

### Ideas not yet implemented (next steps to raise success rate)

1. **Engine memory** — start the ladder at the last-known-good engine for
   that streamId (data already collected, see above).
2. **Server-side remux for live** — an ffmpeg process is not possible on
   Vercel functions, but a tiny companion service (Fly/Railway) doing
   `ffmpeg -c copy -f mp4` remux would beat ffmpeg.wasm for large files.
3. **HEVC detection** — probe `get_vod_info.video.codec_name`; if HEVC and
   `MediaSource.isTypeSupported('video/mp4;codecs="hvc1"')` is false, skip
   straight to the VLC hint instead of burning failover time.
4. **Audio-only fallback** — ffmpeg.wasm extracting just the audio track is
   cheap and better than nothing for oversized files.

## 7. UI conventions

- **Theming**: class-based dark mode (`dark` on `<html>`). Three-way toggle
  light/dark/system persisted in `localStorage("theme")`;
  `ThemeScript.tsx` runs pre-hydration to avoid flash. System mode tracks
  `prefers-color-scheme` changes live. Every component styles both modes —
  keep `dark:` variants on all new UI.
- **Mobile**: hover interactions suppressed via `useHasHover`; sidebar becomes
  a drawer; tiles are poster-aspect. Test both pointer types when touching
  grid/tooltip code.
- **Tiles**: `TileImage` handles broken artwork (failed URLs are remembered
  and show a placeholder, no re-request loops).
- Icons are lucide-react; keep sizes 13–16 in chrome, larger only in
  empty/error states.

## 8. Gotchas

- **OneDrive**: the repo lives in OneDrive. Files can change under you
  mid-session (sync from another machine). If an Edit fails with "modified
  since read" or git state looks inconsistent, re-read files and `git status`
  before assuming corruption.
- **CRLF**: repo checks out LF, Windows git warns about CRLF conversion —
  harmless, ignore.
- `tsconfig.tsbuildinfo` is ignored build output; don't commit it.
- mpegts.js has no proper ESM types: the `(mpegts as any).default || mpegts`
  dance in VideoPlayer is deliberate.
- react-player v3 renamed `url` → `src` and changed callback signatures; don't
  paste v2 examples.
- Drizzle `onConflictDoUpdate` with bulk `.values(rows)` needs
  `sql`excluded.column_name`` refs (snake_case DB names), not row values.
- The XC provider rate-limits: catalogue refresh endpoints already batch;
  don't add parallel upstream fetch storms.

## 9. Commit conventions

Recent history uses imperative single-line summaries, no scopes/emoji
("Harden architecture: …", "Add mobile browser support: …"). Type check +
build before every commit. Committing, pushing, opening a PR, or deploying
always requires explicit user authorization; follow the requested branch and
review workflow when authorization is given.

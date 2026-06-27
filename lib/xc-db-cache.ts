import { and, eq, lt, sql } from "drizzle-orm";
import { addDbLog, errorMessage } from "@/lib/db-log";
import { db } from "@/lib/db";
import { xcCategories, xcSeriesEpisodes, xcSeriesSeasons, xcStreamMetadata, xcStreams } from "@/lib/schema";

type Section = "live" | "vod" | "series";

type CacheContext = {
  profileId: string;
  serverUrl: string;
  action: string;
  params?: Record<string, string>;
};

// The DB cache is a snapshot of the upstream catalogue. Without an age limit it
// is served indefinitely, so newly added movies/streams never appear on a normal
// browse — only a manual force-refresh updates it. Treat rows older than this as
// a miss so the proxy transparently re-fetches and re-persists fresh data.
const DB_CACHE_TTL_MS = Number(process.env.XC_DB_CACHE_TTL_MS) || 24 * 60 * 60 * 1000;

function rowTime(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" || typeof value === "number") {
    const t = new Date(value).getTime();
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

function isStale(rows: { updatedAt: unknown }[]): boolean {
  if (rows.length === 0) return false;
  let newest = 0;
  for (const row of rows) {
    const t = rowTime(row.updatedAt);
    if (t > newest) newest = t;
  }
  return Date.now() - newest > DB_CACHE_TTL_MS;
}

// Postgres caps bound parameters per statement (~65535). Batch inserts in
// chunks so a large category writes in a handful of round-trips instead of one
// awaited statement per row.
const CHUNK_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const CATEGORY_ACTIONS: Record<string, Section> = {
  get_live_categories: "live",
  get_vod_categories: "vod",
  get_series_categories: "series",
};

const STREAM_ACTIONS: Record<string, Section> = {
  get_live_streams: "live",
  get_vod_streams: "vod",
  get_series: "series",
};

function asString(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

function asInteger(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function categoryIdFromParams(params?: Record<string, string>) {
  return params?.category_id || "__all__";
}

function getStreamId(section: Section, item: Record<string, unknown>) {
  const preferred = section === "series" ? item.series_id : item.stream_id;
  return asString(preferred ?? item.id);
}

function getName(item: Record<string, unknown>) {
  return asString(item.name ?? item.title, "Untitled");
}

function getEpisodes(raw: Record<string, unknown>) {
  const episodes = raw.episodes;
  if (!episodes || typeof episodes !== "object" || Array.isArray(episodes)) return [];

  return Object.entries(episodes as Record<string, unknown>).flatMap(([season, value]) => {
    if (!Array.isArray(value)) return [];
    const seasonNumber = asInteger(season) ?? 0;

    return value
      .filter((episode): episode is Record<string, unknown> => Boolean(episode) && typeof episode === "object" && !Array.isArray(episode))
      .map((episode, index) => ({
        seasonNumber,
        episodeId: asString(episode.id ?? episode.episode_id ?? episode.stream_id, `${seasonNumber}-${index}`),
        episodeNum: asInteger(episode.episode_num ?? episode.episode_number ?? episode.num),
        title: getName(episode),
        raw: episode,
      }));
  });
}

function getSeasons(raw: Record<string, unknown>) {
  const seasons = raw.seasons;
  if (!Array.isArray(seasons)) return [];

  return seasons
    .filter((season): season is Record<string, unknown> => Boolean(season) && typeof season === "object" && !Array.isArray(season))
    .map((season, index) => {
      const seasonNumber = asInteger(season.season_number ?? season.number ?? season.season ?? index + 1) ?? index + 1;
      return {
        seasonNumber,
        name: asString(season.name, `Season ${seasonNumber}`),
        episodeCount: asInteger(season.episode_count ?? season.episodes_count ?? season.air_episode_count),
        raw: season,
      };
    });
}

export function isDbCacheableAction(action: string) {
  return Boolean(CATEGORY_ACTIONS[action] || STREAM_ACTIONS[action] || action === "get_vod_info" || action === "get_series_info");
}

export async function readCachedXcData(ctx: CacheContext) {
  const categorySection = CATEGORY_ACTIONS[ctx.action];
  if (categorySection) {
    try {
      const rows = await db
        .select({ raw: xcCategories.raw, updatedAt: xcCategories.updatedAt })
        .from(xcCategories)
        .where(
          and(
            eq(xcCategories.profileId, ctx.profileId),
            eq(xcCategories.serverUrl, ctx.serverUrl),
            eq(xcCategories.section, categorySection),
          ),
        );

      const stale = isStale(rows);
      addDbLog({
        operation: "retrieve",
        status: "success",
        table: "xc_categories",
        action: ctx.action,
        profileId: ctx.profileId,
        section: categorySection,
        count: rows.length,
        message: rows.length === 0 ? "DB cache miss" : stale ? "DB cache stale" : "DB cache hit",
      });

      return rows.length > 0 && !stale ? rows.map((row) => row.raw) : null;
    } catch (error) {
      addDbLog({
        operation: "retrieve",
        status: "failure",
        table: "xc_categories",
        action: ctx.action,
        profileId: ctx.profileId,
        section: categorySection,
        message: errorMessage(error),
      });
      throw error;
    }
  }

  const streamSection = STREAM_ACTIONS[ctx.action];
  if (streamSection) {
    const categoryId = categoryIdFromParams(ctx.params);
    try {
      const rows = await db
        .select({ raw: xcStreams.raw, updatedAt: xcStreams.updatedAt })
        .from(xcStreams)
        .where(
          and(
            eq(xcStreams.profileId, ctx.profileId),
            eq(xcStreams.serverUrl, ctx.serverUrl),
            eq(xcStreams.section, streamSection),
            eq(xcStreams.categoryId, categoryId),
          ),
        );

      const stale = isStale(rows);
      addDbLog({
        operation: "retrieve",
        status: "success",
        table: "xc_streams",
        action: ctx.action,
        profileId: ctx.profileId,
        section: streamSection,
        categoryId,
        count: rows.length,
        message: rows.length === 0 ? "DB cache miss" : stale ? "DB cache stale" : "DB cache hit",
      });

      return rows.length > 0 && !stale ? rows.map((row) => row.raw) : null;
    } catch (error) {
      addDbLog({
        operation: "retrieve",
        status: "failure",
        table: "xc_streams",
        action: ctx.action,
        profileId: ctx.profileId,
        section: streamSection,
        categoryId,
        message: errorMessage(error),
      });
      throw error;
    }
  }

  const metadataSection = ctx.action === "get_vod_info" ? "vod" : ctx.action === "get_series_info" ? "series" : null;
  if (metadataSection) {
    const streamId = ctx.params?.vod_id || ctx.params?.series_id;
    if (!streamId) return null;

    try {
      const rows = await db
        .select({ raw: xcStreamMetadata.raw, updatedAt: xcStreamMetadata.updatedAt })
        .from(xcStreamMetadata)
        .where(
          and(
            eq(xcStreamMetadata.profileId, ctx.profileId),
            eq(xcStreamMetadata.serverUrl, ctx.serverUrl),
            eq(xcStreamMetadata.section, metadataSection),
            eq(xcStreamMetadata.streamId, streamId),
          ),
        )
        .limit(1);

      const stale = isStale(rows);
      addDbLog({
        operation: "retrieve",
        status: "success",
        table: "xc_stream_metadata",
        action: ctx.action,
        profileId: ctx.profileId,
        section: metadataSection,
        streamId,
        count: rows.length,
        message: rows.length === 0 ? "DB cache miss" : stale ? "DB cache stale" : "DB cache hit",
      });

      return rows.length > 0 && !stale ? rows[0].raw : null;
    } catch (error) {
      addDbLog({
        operation: "retrieve",
        status: "failure",
        table: "xc_stream_metadata",
        action: ctx.action,
        profileId: ctx.profileId,
        section: metadataSection,
        streamId,
        message: errorMessage(error),
      });
      throw error;
    }
  }

  return null;
}

export async function writeCachedXcData(ctx: CacheContext, data: unknown, options?: { replace?: boolean }) {
  // replace=true deletes rows for the key that were not part of this write
  // (i.e. removed upstream), so the cache mirrors the source. Callers that write
  // a deliberately filtered subset (e.g. EN-only catalogue update) pass false.
  const replace = options?.replace ?? true;
  const now = new Date();
  const categorySection = CATEGORY_ACTIONS[ctx.action];
  if (categorySection && Array.isArray(data)) {
    const rows = data
      .filter(isRecord)
      .map((item) => ({
        profileId: ctx.profileId,
        serverUrl: ctx.serverUrl,
        section: categorySection,
        categoryId: asString(item.category_id ?? item.id),
        name: asString(item.category_name ?? item.name, "Untitled"),
        parentId: asInteger(item.parent_id),
        raw: item,
        updatedAt: now,
      }))
      .filter((row) => row.categoryId);

    try {
      for (const part of chunk(rows, CHUNK_SIZE)) {
        await db
          .insert(xcCategories)
          .values(part)
          .onConflictDoUpdate({
            target: [xcCategories.profileId, xcCategories.serverUrl, xcCategories.section, xcCategories.categoryId],
            set: {
              name: sql`excluded.name`,
              parentId: sql`excluded.parent_id`,
              raw: sql`excluded.raw`,
              updatedAt: sql`excluded.updated_at`,
            },
          });
      }
      let removed = 0;
      if (replace && rows.length > 0) {
        const deleted = await db
          .delete(xcCategories)
          .where(
            and(
              eq(xcCategories.profileId, ctx.profileId),
              eq(xcCategories.serverUrl, ctx.serverUrl),
              eq(xcCategories.section, categorySection),
              lt(xcCategories.updatedAt, now),
            ),
          )
          .returning({ categoryId: xcCategories.categoryId });
        removed = deleted.length;
      }
      addDbLog({
        operation: "update",
        status: "success",
        table: "xc_categories",
        action: ctx.action,
        profileId: ctx.profileId,
        section: categorySection,
        count: rows.length,
        message: removed ? `Upserted category rows, removed ${removed} stale` : "Upserted category rows",
      });
    } catch (error) {
      addDbLog({
        operation: "update",
        status: "failure",
        table: "xc_categories",
        action: ctx.action,
        profileId: ctx.profileId,
        section: categorySection,
        count: rows.length,
        message: errorMessage(error),
      });
      throw error;
    }
    return;
  }

  const streamSection = STREAM_ACTIONS[ctx.action];
  if (streamSection && Array.isArray(data)) {
    const categoryId = categoryIdFromParams(ctx.params);
    const rows = data
      .filter(isRecord)
      .map((item) => ({
        profileId: ctx.profileId,
        serverUrl: ctx.serverUrl,
        section: streamSection,
        categoryId,
        streamId: getStreamId(streamSection, item),
        name: getName(item),
        raw: item,
        updatedAt: now,
      }))
      .filter((row) => row.streamId);

    try {
      for (const part of chunk(rows, CHUNK_SIZE)) {
        await db
          .insert(xcStreams)
          .values(part)
          .onConflictDoUpdate({
            target: [xcStreams.profileId, xcStreams.serverUrl, xcStreams.section, xcStreams.categoryId, xcStreams.streamId],
            set: {
              name: sql`excluded.name`,
              raw: sql`excluded.raw`,
              updatedAt: sql`excluded.updated_at`,
            },
          });
      }
      let removed = 0;
      if (replace && rows.length > 0) {
        const deleted = await db
          .delete(xcStreams)
          .where(
            and(
              eq(xcStreams.profileId, ctx.profileId),
              eq(xcStreams.serverUrl, ctx.serverUrl),
              eq(xcStreams.section, streamSection),
              eq(xcStreams.categoryId, categoryId),
              lt(xcStreams.updatedAt, now),
            ),
          )
          .returning({ streamId: xcStreams.streamId });
        removed = deleted.length;
      }
      addDbLog({
        operation: "update",
        status: "success",
        table: "xc_streams",
        action: ctx.action,
        profileId: ctx.profileId,
        section: streamSection,
        categoryId,
        count: rows.length,
        message: removed ? `Upserted stream rows, removed ${removed} stale` : "Upserted stream rows",
      });
    } catch (error) {
      addDbLog({
        operation: "update",
        status: "failure",
        table: "xc_streams",
        action: ctx.action,
        profileId: ctx.profileId,
        section: streamSection,
        categoryId,
        count: rows.length,
        message: errorMessage(error),
      });
      throw error;
    }
    return;
  }

  const metadataSection = ctx.action === "get_vod_info" ? "vod" : ctx.action === "get_series_info" ? "series" : null;
  if (!metadataSection || !data || typeof data !== "object" || Array.isArray(data)) return;

  const streamId = ctx.params?.vod_id || ctx.params?.series_id;
  if (!streamId) return;

  const raw = data as Record<string, unknown>;
  const info = (raw.info && typeof raw.info === "object" && !Array.isArray(raw.info))
    ? raw.info as Record<string, unknown>
    : raw;

  try {
    await db
      .insert(xcStreamMetadata)
      .values({
        profileId: ctx.profileId,
        serverUrl: ctx.serverUrl,
        section: metadataSection,
        streamId,
        info,
        raw,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [xcStreamMetadata.profileId, xcStreamMetadata.serverUrl, xcStreamMetadata.section, xcStreamMetadata.streamId],
        set: {
          info,
          raw,
          updatedAt: now,
        },
      });

    addDbLog({
      operation: "update",
      status: "success",
      table: "xc_stream_metadata",
      action: ctx.action,
      profileId: ctx.profileId,
      section: metadataSection,
      streamId,
      count: 1,
      message: "Upserted metadata row",
    });
  } catch (error) {
    addDbLog({
      operation: "update",
      status: "failure",
      table: "xc_stream_metadata",
      action: ctx.action,
      profileId: ctx.profileId,
      section: metadataSection,
      streamId,
      message: errorMessage(error),
    });
    throw error;
  }

  if (metadataSection !== "series") return;

  const seasons = getSeasons(raw);
  try {
    const seasonRows = seasons.map((season) => ({
      profileId: ctx.profileId,
      serverUrl: ctx.serverUrl,
      seriesId: streamId,
      seasonNumber: season.seasonNumber,
      name: season.name,
      episodeCount: season.episodeCount,
      raw: season.raw,
      updatedAt: now,
    }));
    for (const part of chunk(seasonRows, CHUNK_SIZE)) {
      await db
        .insert(xcSeriesSeasons)
        .values(part)
        .onConflictDoUpdate({
          target: [xcSeriesSeasons.profileId, xcSeriesSeasons.serverUrl, xcSeriesSeasons.seriesId, xcSeriesSeasons.seasonNumber],
          set: {
            name: sql`excluded.name`,
            episodeCount: sql`excluded.episode_count`,
            raw: sql`excluded.raw`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }
    if (replace && seasonRows.length > 0) {
      await db
        .delete(xcSeriesSeasons)
        .where(
          and(
            eq(xcSeriesSeasons.profileId, ctx.profileId),
            eq(xcSeriesSeasons.serverUrl, ctx.serverUrl),
            eq(xcSeriesSeasons.seriesId, streamId),
            lt(xcSeriesSeasons.updatedAt, now),
          ),
        );
    }
    addDbLog({
      operation: "update",
      status: "success",
      table: "xc_series_seasons",
      action: ctx.action,
      profileId: ctx.profileId,
      section: metadataSection,
      streamId,
      count: seasons.length,
      message: "Upserted series season rows",
    });
  } catch (error) {
    addDbLog({
      operation: "update",
      status: "failure",
      table: "xc_series_seasons",
      action: ctx.action,
      profileId: ctx.profileId,
      section: metadataSection,
      streamId,
      count: seasons.length,
      message: errorMessage(error),
    });
    throw error;
  }

  const episodes = getEpisodes(raw);
  try {
    const episodeRows = episodes.map((episode) => ({
      profileId: ctx.profileId,
      serverUrl: ctx.serverUrl,
      seriesId: streamId,
      seasonNumber: episode.seasonNumber,
      episodeId: episode.episodeId,
      episodeNum: episode.episodeNum,
      title: episode.title,
      raw: episode.raw,
      updatedAt: now,
    }));
    for (const part of chunk(episodeRows, CHUNK_SIZE)) {
      await db
        .insert(xcSeriesEpisodes)
        .values(part)
        .onConflictDoUpdate({
          target: [xcSeriesEpisodes.profileId, xcSeriesEpisodes.serverUrl, xcSeriesEpisodes.seriesId, xcSeriesEpisodes.seasonNumber, xcSeriesEpisodes.episodeId],
          set: {
            episodeNum: sql`excluded.episode_num`,
            title: sql`excluded.title`,
            raw: sql`excluded.raw`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }
    if (replace && episodeRows.length > 0) {
      await db
        .delete(xcSeriesEpisodes)
        .where(
          and(
            eq(xcSeriesEpisodes.profileId, ctx.profileId),
            eq(xcSeriesEpisodes.serverUrl, ctx.serverUrl),
            eq(xcSeriesEpisodes.seriesId, streamId),
            lt(xcSeriesEpisodes.updatedAt, now),
          ),
        );
    }
    addDbLog({
      operation: "update",
      status: "success",
      table: "xc_series_episodes",
      action: ctx.action,
      profileId: ctx.profileId,
      section: metadataSection,
      streamId,
      count: episodes.length,
      message: "Upserted series episode rows",
    });
  } catch (error) {
    addDbLog({
      operation: "update",
      status: "failure",
      table: "xc_series_episodes",
      action: ctx.action,
      profileId: ctx.profileId,
      section: metadataSection,
      streamId,
      count: episodes.length,
      message: errorMessage(error),
    });
    throw error;
  }
}

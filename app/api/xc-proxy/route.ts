import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { profiles } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { buildApiUrl } from "@/lib/xc";
import { isDbCacheableAction, readCachedXcData, writeCachedXcData } from "@/lib/xc-db-cache";
import { recordCacheMetric } from "@/lib/metrics";
import { resolveCredentials } from "@/lib/credentials";

export const runtime = "nodejs";
export const maxDuration = 60;

// Stream-list actions can return thousands of rows; trim each item to the fields
// the UI actually uses so the response stays well clear of the serverless body
// limit. The full object is still kept in the DB cache (xcStreams.raw).
const LIST_ACTIONS = new Set(["get_live_streams", "get_vod_streams", "get_series"]);
const LIST_FIELDS = [
  "num", "name", "title", "stream_id", "series_id", "id", "stream_type",
  "stream_icon", "cover", "movie_image", "backdrop_path", "container_extension",
  "rating", "rating_5based", "year", "releaseDate", "release_date", "releasedate",
  "genre", "plot", "cast", "director", "added", "last_modified", "category_id",
  "episode_run_time", "season",
] as const;

function projectListItem(item: unknown): unknown {
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  const src = item as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of LIST_FIELDS) {
    if (src[field] !== undefined) out[field] = src[field];
  }
  return out;
}

function shapeResponse(action: string, data: unknown): unknown {
  if (LIST_ACTIONS.has(action) && Array.isArray(data)) {
    return data.map(projectListItem);
  }
  return data;
}

export async function POST(request: Request) {
  try {
    const { profileId, action, params, forceRefresh } = await request.json();
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, profileId));

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const serverUrl = profile.servers[profile.activeServerIndex];
    if (!serverUrl) {
      return NextResponse.json({ error: "No server configured for profile" }, { status: 400 });
    }

    // DB cache is the single persistent cache layer (it survives across
    // serverless instances, unlike a per-instance in-memory map).
    if (!forceRefresh && isDbCacheableAction(action)) {
      const cached = await readCachedXcData({ profileId, serverUrl, action, params });
      if (cached) {
        void recordCacheMetric("db_hit");
        return NextResponse.json(shapeResponse(action, cached));
      }
    }

    const { username, password } = resolveCredentials(profile);
    const apiUrl = buildApiUrl(serverUrl, action, username, password, params);
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      return NextResponse.json(
        { error: `XC API returned ${res.status}` },
        { status: res.status },
      );
    }

    const data = await res.json();
    void recordCacheMetric("upstream");
    if (isDbCacheableAction(action)) {
      await writeCachedXcData({ profileId, serverUrl, action, params }, data);
    }
    return NextResponse.json(shapeResponse(action, data));
  } catch {
    return NextResponse.json({ error: "XC API request failed" }, { status: 500 });
  }
}

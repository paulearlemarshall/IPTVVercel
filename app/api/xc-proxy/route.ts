import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { profiles } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { buildApiUrl } from "@/lib/xc";
import { apiCache } from "@/lib/cache";
import { isDbCacheableAction, readCachedXcData, writeCachedXcData } from "@/lib/xc-db-cache";

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

    const apiUrl = buildApiUrl(
      serverUrl,
      action,
      profile.username,
      profile.password,
      params,
    );

    if (!forceRefresh && isDbCacheableAction(action)) {
      const cached = await readCachedXcData({ profileId, serverUrl, action, params });
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    if (!forceRefresh) {
      const cached = apiCache.get(apiUrl);
      if (cached) {
        if (isDbCacheableAction(action)) {
          await writeCachedXcData({ profileId, serverUrl, action, params }, cached.data);
        }
        return NextResponse.json(cached.data);
      }
    }

    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      return NextResponse.json(
        { error: `XC API returned ${res.status}` },
        { status: res.status },
      );
    }

    const data = await res.json();
    if (isDbCacheableAction(action)) {
      await writeCachedXcData({ profileId, serverUrl, action, params }, data);
    }
    apiCache.set(apiUrl, data);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "XC API request failed" }, { status: 500 });
  }
}

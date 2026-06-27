import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { profiles } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { buildApiUrl } from "@/lib/xc";

const cache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL = 86_400_000;

export async function POST(request: Request) {
  try {
    const { profileId, action, params } = await request.json();
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

    const cached = cache.get(apiUrl);
    if (cached && cached.expiry > Date.now()) {
      return NextResponse.json(cached.data);
    }

    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      return NextResponse.json(
        { error: `XC API returned ${res.status}` },
        { status: res.status },
      );
    }

    const data = await res.json();
    cache.set(apiUrl, { data, expiry: Date.now() + CACHE_TTL });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "XC API request failed" }, { status: 500 });
  }
}

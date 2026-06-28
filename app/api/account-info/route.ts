import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { profiles } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { buildApiUrl } from "@/lib/xc";
import { resolveCredentials } from "@/lib/credentials";

export async function POST(request: Request) {
  try {
    const { profileId } = await request.json();
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, profileId));

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const serverUrl = profile.servers[profile.activeServerIndex];
    if (!serverUrl) {
      return NextResponse.json({ error: "No server configured" }, { status: 400 });
    }

    const { username, password } = resolveCredentials(profile);
    const res = await fetch(
      buildApiUrl(serverUrl, "", username, password),
      { signal: AbortSignal.timeout(10_000) },
    );

    if (!res.ok) {
      return NextResponse.json({ error: `XC API returned ${res.status}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({
      ...data,
      server: {
        url: serverUrl,
        activeServerIndex: profile.activeServerIndex,
        configuredServers: profile.servers.length,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch account info" }, { status: 500 });
  }
}

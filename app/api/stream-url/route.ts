import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { profiles } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getXcUrl, normalizeContainerExtension } from "@/lib/xc";
import { resolveCredentials } from "@/lib/credentials";

export async function POST(request: Request) {
  try {
    const { profileId, stream, section } = await request.json();
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
    const url = getXcUrl(stream, section, serverUrl, username, password);

    if (!url) {
      return NextResponse.json({ error: "Could not construct stream URL" }, { status: 400 });
    }

    const streamId = (stream.stream_id ?? stream.id) as string | undefined;
    const ext = normalizeContainerExtension(stream.container_extension);
    const proxyUrl = streamId
      ? `/api/playback?${new URLSearchParams({
          profileId,
          section,
          streamId,
          ext,
        }).toString()}`
      : null;

    let alternateUrl: string | null = null;
    let alternateProxyUrl: string | null = null;
    if (section === "live" && streamId) {
      const alternateExt = ext === "m3u8" ? "ts" : "m3u8";
      alternateUrl = getXcUrl({ ...stream, container_extension: alternateExt }, section, serverUrl, username, password);
      alternateProxyUrl = `/api/playback?${new URLSearchParams({ profileId, section, streamId, ext: alternateExt }).toString()}`;
    }

    return NextResponse.json({ url, proxyUrl, alternateUrl, alternateProxyUrl });
  } catch {
    return NextResponse.json({ error: "Failed to get stream URL" }, { status: 500 });
  }
}

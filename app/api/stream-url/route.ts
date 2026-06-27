import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { profiles } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getXcUrl, normalizeContainerExtension } from "@/lib/xc";

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

    const url = getXcUrl(
      stream,
      section,
      serverUrl,
      profile.username,
      profile.password,
    );

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

    return NextResponse.json({ url, proxyUrl });
  } catch {
    return NextResponse.json({ error: "Failed to get stream URL" }, { status: 500 });
  }
}

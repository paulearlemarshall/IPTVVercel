import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { profiles } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getXcUrl, normalizeContainerExtension } from "@/lib/xc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_SECTIONS = new Set(["live", "vod", "episode"]);
const CONTENT_TYPES: Record<string, string> = {
  mkv: "video/x-matroska",
  mov: "video/quicktime",
  mp4: "video/mp4",
  m4v: "video/mp4",
  ts: "video/mp2t",
  webm: "video/webm",
};

function safeHeader(value: string | null) {
  return value && value.length < 256 ? value : null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get("profileId");
    const section = searchParams.get("section");
    const streamId = searchParams.get("streamId");
    const ext = normalizeContainerExtension(searchParams.get("ext"));

    if (!profileId || !section || !streamId || !VALID_SECTIONS.has(section)) {
      return NextResponse.json({ error: "Invalid playback request" }, { status: 400 });
    }

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

    const upstreamUrl = getXcUrl(
      { stream_id: streamId, container_extension: ext },
      section,
      serverUrl,
      profile.username,
      profile.password,
    );

    if (!upstreamUrl) {
      return NextResponse.json({ error: "Could not construct stream URL" }, { status: 400 });
    }

    const range = safeHeader(request.headers.get("range"));
    const upstream = await fetch(upstreamUrl, {
      headers: range ? { range } : undefined,
      redirect: "follow",
    });

    const headers = new Headers();
    const passthrough = [
      "accept-ranges",
      "cache-control",
      "content-length",
      "content-range",
      "content-type",
      "last-modified",
    ];

    for (const name of passthrough) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }

    if (!headers.has("content-type")) {
      headers.set("content-type", section === "live" ? "video/mp2t" : CONTENT_TYPES[ext] ?? "application/octet-stream");
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  } catch {
    return NextResponse.json({ error: "Playback proxy failed" }, { status: 502 });
  }
}

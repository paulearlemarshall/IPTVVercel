import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { profiles } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getXcUrl, normalizeContainerExtension } from "@/lib/xc";
import { resolveCredentials } from "@/lib/credentials";

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

function playlistProxyUri(
  uri: string,
  upstreamUrl: string,
  profileId: string,
  section: string,
  streamId: string,
  ext: string,
) {
  try {
    const target = new URL(uri, upstreamUrl);
    // Do not turn this endpoint into an open proxy. Cross-origin CDN segment
    // URLs remain direct; same-origin provider paths are safely re-routed.
    if (target.origin !== new URL(upstreamUrl).origin) return uri;
    return `/api/playback?${new URLSearchParams({
      profileId,
      section,
      streamId,
      ext,
      path: uri,
    }).toString()}`;
  } catch {
    return uri;
  }
}

function rewritePlaylist(
  body: string,
  upstreamUrl: string,
  profileId: string,
  section: string,
  streamId: string,
  ext: string,
) {
  const rewrite = (uri: string) => playlistProxyUri(uri, upstreamUrl, profileId, section, streamId, ext);
  return body
    .split(/(\r?\n)/)
    .map((line) => {
      if (/^#/.test(line)) {
        return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => `URI="${rewrite(uri)}"`);
      }
      return line.trim() ? rewrite(line.trim()) : line;
    })
    .join("");
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get("profileId");
    const section = searchParams.get("section");
    const streamId = searchParams.get("streamId");
    const ext = normalizeContainerExtension(searchParams.get("ext"));
    const path = searchParams.get("path");

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

    const { username, password } = resolveCredentials(profile);
    const playlistUrl = getXcUrl(
      { stream_id: streamId, container_extension: ext },
      section,
      serverUrl,
      username,
      password,
    );

    if (!playlistUrl) {
      return NextResponse.json({ error: "Could not construct stream URL" }, { status: 400 });
    }

    let upstreamUrl = playlistUrl;
    if (path) {
      try {
        const target = new URL(path, playlistUrl);
        if (target.origin !== new URL(playlistUrl).origin) {
          return NextResponse.json({ error: "Invalid playback resource" }, { status: 400 });
        }
        upstreamUrl = target.toString();
      } catch {
        return NextResponse.json({ error: "Invalid playback resource" }, { status: 400 });
      }
    }

    const range = safeHeader(request.headers.get("range"));
    const upstream = await fetch(upstreamUrl, {
      headers: {
        ...(range ? { range } : {}),
        "user-agent": request.headers.get("user-agent") || "IPTVVercel/1.0",
      },
      redirect: "follow",
    });

    const isPlaylist = ext === "m3u8" && upstream.ok && (
      upstream.headers.get("content-type")?.toLowerCase().includes("mpegurl") ||
      upstream.headers.get("content-type")?.toLowerCase().includes("m3u8")
    );
    const body = isPlaylist
      ? rewritePlaylist(await upstream.text(), upstreamUrl, profileId, section, streamId, ext)
      : upstream.body;
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
      if (isPlaylist && ["content-length", "content-range", "accept-ranges"].includes(name)) continue;
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }

    headers.set("content-disposition", "inline");
    headers.set("x-content-type-options", "nosniff");
    headers.set("cache-control", headers.get("cache-control") || "private, no-transform");

    if (!headers.has("content-type")) {
      headers.set("content-type", section === "live" ? "video/mp2t" : CONTENT_TYPES[ext] ?? "application/octet-stream");
    }
    if (isPlaylist) headers.set("content-type", "application/vnd.apple.mpegurl");
    headers.set("access-control-allow-origin", "*");

    return new Response(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  } catch {
    return NextResponse.json({ error: "Playback proxy failed" }, { status: 502 });
  }
}

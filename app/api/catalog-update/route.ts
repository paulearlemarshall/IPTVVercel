import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { profiles } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { buildApiUrl } from "@/lib/xc";
import { writeCachedXcData } from "@/lib/xc-db-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SECTIONS = ["live", "vod", "series"] as const;
type Section = (typeof SECTIONS)[number];

const ACTIONS: Record<Section, { categories: string; streams: string }> = {
  live: { categories: "get_live_categories", streams: "get_live_streams" },
  vod: { categories: "get_vod_categories", streams: "get_vod_streams" },
  series: { categories: "get_series_categories", streams: "get_series" },
};

async function fetchXc<T>(
  serverUrl: string,
  action: string,
  username: string,
  password: string,
  params?: Record<string, string>,
): Promise<T> {
  const res = await fetch(buildApiUrl(serverUrl, action, username, password, params), {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`${action || "account"} returned ${res.status}`);
  return res.json() as Promise<T>;
}

function normalizeSections(value: unknown): Section[] {
  if (value === "all") return [...SECTIONS];
  return SECTIONS.includes(value as Section) ? [value as Section] : [];
}

export async function POST(request: Request) {
  try {
    const { profileId, section } = await request.json();
    const sections = normalizeSections(section);
    if (!profileId || sections.length === 0) {
      return NextResponse.json({ error: "Invalid update request" }, { status: 400 });
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

    const summary: Record<string, { categories: number; streams: number; failures: number }> = {};

    for (const current of sections) {
      const actions = ACTIONS[current];
      const categories = await fetchXc<Record<string, unknown>[]>(
        serverUrl,
        actions.categories,
        profile.username,
        profile.password,
      );
      const categoryRows = Array.isArray(categories) ? categories : [];
      await writeCachedXcData(
        { profileId, serverUrl, action: actions.categories },
        categoryRows,
      );

      let streamCount = 0;
      let failures = 0;
      for (const category of categoryRows) {
        const categoryId = String(category.category_id ?? "");
        if (!categoryId) continue;
        try {
          const streams = await fetchXc<Record<string, unknown>[]>(
            serverUrl,
            actions.streams,
            profile.username,
            profile.password,
            { category_id: categoryId },
          );
          const streamRows = Array.isArray(streams) ? streams : [];
          streamCount += streamRows.length;
          await writeCachedXcData(
            { profileId, serverUrl, action: actions.streams, params: { category_id: categoryId } },
            streamRows,
          );
        } catch {
          failures += 1;
        }
      }

      summary[current] = {
        categories: categoryRows.length,
        streams: streamCount,
        failures,
      };
    }

    return NextResponse.json({ success: true, summary });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Catalogue update failed" },
      { status: 500 },
    );
  }
}

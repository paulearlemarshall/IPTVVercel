import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { xcPlaybackResults } from "@/lib/schema";

export async function POST(request: Request) {
  try {
    const { profileId, section, streamId, tech, status, message } = await request.json();
    if (!profileId || !section || !streamId || !tech || !status) {
      return NextResponse.json({ error: "Invalid playback result" }, { status: 400 });
    }

    await db
      .insert(xcPlaybackResults)
      .values({
        profileId,
        section,
        streamId,
        tech,
        status,
        message,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          xcPlaybackResults.profileId,
          xcPlaybackResults.section,
          xcPlaybackResults.streamId,
          xcPlaybackResults.tech,
        ],
        set: {
          status,
          message,
          attempts: sql`${xcPlaybackResults.attempts} + 1`,
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to record playback result" }, { status: 500 });
  }
}

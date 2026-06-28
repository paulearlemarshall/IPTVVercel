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
      return NextResponse.json({ error: "No server configured for profile" }, { status: 400 });
    }

    const { username, password } = resolveCredentials(profile);
    const authUrl = buildApiUrl(serverUrl, "user_info", username, password);

    const res = await fetch(authUrl, { signal: AbortSignal.timeout(10_000) });
    const data = await res.json();

    return NextResponse.json({ valid: data?.user_info != null, accountInfo: data?.user_info ?? null });
  } catch {
    return NextResponse.json({ valid: false, error: "Authentication request failed" }, { status: 500 });
  }
}

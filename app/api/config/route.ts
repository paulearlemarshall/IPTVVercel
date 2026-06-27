import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { profiles } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const all = await db.select().from(profiles);
    return NextResponse.json(
      all.map((p) => ({
        id: p.id,
        name: p.name,
        serverUrl: p.serverUrl,
      })),
    );
  } catch {
    return NextResponse.json({ error: "Failed to fetch profiles" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, name, serverUrl, username, password } = body;
    await db.insert(profiles).values({ id, name, serverUrl, username, password });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, favorites } = body;
    await db.update(profiles).set({ favorites }).where(eq(profiles.id, id));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}

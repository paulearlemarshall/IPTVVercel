import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { profiles } from "@/lib/schema";
import { eq } from "drizzle-orm";

async function ensureDefaultProfile() {
  const existing = await db.select({ id: profiles.id }).from(profiles).limit(1);
  if (existing.length > 0) return;

  const servers: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const url = process.env[`XC_SERVER_${i}`];
    if (url) servers.push(url);
  }

  const username = process.env.XC_USERNAME;
  const password = process.env.XC_PASSWORD;

  if (username && password && servers.length > 0) {
    await db.insert(profiles).values({
      id: "default",
      name: "Default",
      servers,
      username,
      password,
    });
  }
}

export async function GET() {
  try {
    await ensureDefaultProfile();
    const all = await db.select().from(profiles);
    return NextResponse.json(
      all.map((p) => ({
        id: p.id,
        name: p.name,
        servers: p.servers,
        activeServerIndex: p.activeServerIndex,
      })),
    );
  } catch {
    return NextResponse.json({ error: "Failed to fetch profiles" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, name, servers, username, password } = body;
    await db.insert(profiles).values({
      id,
      name,
      servers: servers ?? [],
      username,
      password,
    });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, favorites, servers, activeServerIndex } = body;
    const update: Record<string, unknown> = {};
    if (favorites !== undefined) update.favorites = favorites;
    if (servers !== undefined) update.servers = servers;
    if (activeServerIndex !== undefined) update.activeServerIndex = activeServerIndex;
    await db.update(profiles).set(update).where(eq(profiles.id, id));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}

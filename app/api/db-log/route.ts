import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { clearDbLog, getDbLog } from "@/lib/db-log";
import { dbActivityLogs } from "@/lib/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db
      .select()
      .from(dbActivityLogs)
      .orderBy(desc(dbActivityLogs.createdAt))
      .limit(200);

    return NextResponse.json({
      entries: rows.map((row) => ({
        id: row.id,
        at: row.createdAt.toISOString(),
        operation: row.operation,
        status: row.status,
        table: row.table,
        action: row.action,
        profileId: row.profileId ?? undefined,
        section: row.section ?? undefined,
        categoryId: row.categoryId ?? undefined,
        streamId: row.streamId ?? undefined,
        count: row.count ?? undefined,
        message: row.message ?? undefined,
      })),
      total: rows.length,
    });
  } catch {
    return NextResponse.json(getDbLog());
  }
}

export async function DELETE() {
  clearDbLog();
  try {
    await db.delete(dbActivityLogs);
  } catch {
    /* ignore */
  }
  return NextResponse.json({ success: true });
}

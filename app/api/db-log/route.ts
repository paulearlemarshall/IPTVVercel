import { NextResponse } from "next/server";
import { clearDbLog, getDbLog } from "@/lib/db-log";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getDbLog());
}

export async function DELETE() {
  clearDbLog();
  return NextResponse.json({ success: true });
}

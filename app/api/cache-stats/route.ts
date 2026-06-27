import { NextResponse } from "next/server";
import { apiCache } from "@/lib/cache";

export async function GET() {
  return NextResponse.json(apiCache.stats());
}

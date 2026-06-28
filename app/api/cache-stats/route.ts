import { NextResponse } from "next/server";
import { readCacheMetrics } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const metrics = await readCacheMetrics();
    const totalRequests = metrics.db_hit + metrics.upstream;
    return NextResponse.json({
      totalRequests,
      cacheHits: metrics.db_hit,
      upstreamFetches: metrics.upstream,
    });
  } catch {
    return NextResponse.json({ totalRequests: 0, cacheHits: 0, upstreamFetches: 0 });
  }
}

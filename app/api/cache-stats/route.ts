import { NextResponse } from "next/server";
import { apiCache } from "@/lib/cache";
import { readCacheMetrics } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export async function GET() {
  const local = apiCache.stats();
  try {
    const metrics = await readCacheMetrics();
    const cacheHits = metrics.db_hit + metrics.memory_hit;
    const totalRequests = cacheHits + metrics.upstream;
    return NextResponse.json({
      totalRequests,
      cacheHits,
      dbHits: metrics.db_hit,
      memoryHits: metrics.memory_hit,
      upstreamFetches: metrics.upstream,
      memoryEntries: local.entries,
    });
  } catch {
    // Fall back to the per-instance in-memory counters if the metrics table
    // is unavailable (e.g. migration not yet applied).
    return NextResponse.json({
      totalRequests: local.totalRequests,
      cacheHits: local.cacheHits,
      dbHits: 0,
      memoryHits: local.cacheHits,
      upstreamFetches: local.cacheMisses,
      memoryEntries: local.entries,
    });
  }
}

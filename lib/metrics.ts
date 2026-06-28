import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { cacheMetrics } from "@/lib/schema";

// Durable, cross-instance counters for the request-source meter: how many
// requests were served from the DB cache vs. fetched from the upstream provider.
export type CacheMetric = "db_hit" | "upstream";

export async function recordCacheMetric(metric: CacheMetric): Promise<void> {
  try {
    await db
      .insert(cacheMetrics)
      .values({ metric, count: 1, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: cacheMetrics.metric,
        set: {
          count: sql`${cacheMetrics.count} + 1`,
          updatedAt: new Date(),
        },
      });
  } catch {
    /* metering must never break a request */
  }
}

export async function readCacheMetrics(): Promise<Record<CacheMetric, number>> {
  const totals: Record<CacheMetric, number> = {
    db_hit: 0,
    upstream: 0,
  };
  const rows = await db.select().from(cacheMetrics);
  for (const row of rows) {
    if (row.metric === "db_hit" || row.metric === "upstream") {
      totals[row.metric] = row.count;
    }
  }
  return totals;
}

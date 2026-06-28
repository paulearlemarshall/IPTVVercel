"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, X } from "lucide-react";

interface Stats {
  totalRequests: number;
  cacheHits: number;
  upstreamFetches: number;
}

export default function StatsModal() {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/cache-stats");
      setStats(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    return () => clearInterval(interval);
  }, [open, fetchStats]);

  const hitRate = stats
    ? stats.totalRequests > 0
      ? ((stats.cacheHits / stats.totalRequests) * 100).toFixed(1)
      : "0.0"
    : "—";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Cache Stats"
        className="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
      >
        <BarChart3 size={16} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-80 rounded-lg border border-gray-200 bg-white p-4 shadow-lg dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">API Cache Stats</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <Row label="Total Requests" value={stats?.totalRequests ?? "—"} />
              <Row label="Upstream API Calls" value={stats?.upstreamFetches ?? "—"} />
              <Row label="DB Cache Hits" value={stats?.cacheHits ?? "—"} />
              <Row label="API Calls Avoided" value={`${hitRate}%`} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Info, RefreshCw, X } from "lucide-react";

interface AccountModalProps {
  profileId?: string;
}

function formatExpiry(value: unknown) {
  const raw = typeof value === "string" || typeof value === "number" ? Number(value) : 0;
  if (!raw) return "Unknown";
  return new Date(raw * 1000).toLocaleString();
}

export default function AccountModal({ profileId }: AccountModalProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchInfo = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/account-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId }),
      });
      setData(await res.json());
    } catch {
      setData({ error: "Failed to fetch account info" });
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    if (open) fetchInfo();
  }, [open, fetchInfo]);

  const user = data?.user_info ?? {};
  const server = data?.server_info ?? {};

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Account Details"
        className="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        disabled={!profileId}
      >
        <Info size={16} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg border border-gray-200 bg-white p-4 shadow-lg dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold">Account Details</h2>
              <button
                onClick={fetchInfo}
                title="Refresh"
                className="ml-auto rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              >
                <RefreshCw size={15} />
              </button>
              <button
                onClick={() => setOpen(false)}
                title="Close"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              >
                <X size={16} />
              </button>
            </div>
            {loading ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
            ) : data?.error ? (
              <div className="text-sm text-red-700 dark:text-red-300">{data.error}</div>
            ) : (
              <div className="space-y-2 text-sm">
                <Row label="Status" value={user.status ?? "Unknown"} />
                <Row label="Username" value={user.username ?? "Unknown"} />
                <Row label="Expires" value={formatExpiry(user.exp_date)} />
                <Row label="Active Connections" value={user.active_cons ?? "Unknown"} />
                <Row label="Max Connections" value={user.max_connections ?? "Unknown"} />
                <Row label="Server URL" value={data?.server?.url ?? "Unknown"} />
                <Row label="Server Timezone" value={server.timezone ?? "Unknown"} />
                <Row label="Server Time" value={server.time_now ?? "Unknown"} />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="grid grid-cols-[150px_1fr] gap-3">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="break-all font-medium">{String(value)}</span>
    </div>
  );
}

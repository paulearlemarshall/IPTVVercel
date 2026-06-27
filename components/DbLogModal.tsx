"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { Database, RefreshCw, Trash2, X } from "lucide-react";

interface DbLogEntry {
  id: number;
  at: string;
  operation: "retrieve" | "insert" | "update";
  status: "success" | "failure";
  table: string;
  action: string;
  profileId?: string;
  section?: string;
  categoryId?: string;
  streamId?: string;
  count?: number;
  message?: string;
}

interface DbLogResponse {
  entries: DbLogEntry[];
  total: number;
}

export default function DbLogModal() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<DbLogResponse>({ entries: [], total: 0 });

  const fetchLog = useCallback(async () => {
    try {
      const res = await fetch("/api/db-log", { cache: "no-store" });
      setData(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  const clearLog = useCallback(async () => {
    try {
      await fetch("/api/db-log", { method: "DELETE" });
      setData({ entries: [], total: 0 });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchLog();
    const interval = setInterval(fetchLog, 1500);
    return () => clearInterval(interval);
  }, [open, fetchLog]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="DB Log"
        className="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
      >
        <Database size={16} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[80vh] w-full max-w-5xl flex-col rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center gap-2 border-b border-gray-200 p-4 dark:border-gray-700">
              <h2 className="text-sm font-semibold">DB Log</h2>
              <span className="text-xs text-gray-400">{data.total} recent records</span>
              <button
                onClick={fetchLog}
                title="Refresh"
                className="ml-auto rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              >
                <RefreshCw size={15} />
              </button>
              <button
                onClick={clearLog}
                title="Clear"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              >
                <Trash2 size={15} />
              </button>
              <button
                onClick={() => setOpen(false)}
                title="Close"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              >
                <X size={16} />
              </button>
            </div>

            <div className="overflow-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="sticky top-0 bg-gray-50 text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                  <tr>
                    <Th>Time</Th>
                    <Th>Status</Th>
                    <Th>Op</Th>
                    <Th>Table</Th>
                    <Th>Action</Th>
                    <Th>Context</Th>
                    <Th>Count</Th>
                    <Th>Message</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-gray-400">
                        No DB activity recorded yet.
                      </td>
                    </tr>
                  ) : (
                    data.entries.map((entry) => (
                      <tr key={entry.id} className="border-t border-gray-100 dark:border-gray-700">
                        <Td>{new Date(entry.at).toLocaleTimeString()}</Td>
                        <Td>
                          <span
                            className={`rounded px-1.5 py-0.5 font-semibold ${
                              entry.status === "success"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                            }`}
                          >
                            {entry.status}
                          </span>
                        </Td>
                        <Td>{entry.operation}</Td>
                        <Td>{entry.table}</Td>
                        <Td>{entry.action}</Td>
                        <Td>
                          {[entry.section, entry.categoryId && `cat:${entry.categoryId}`, entry.streamId && `stream:${entry.streamId}`]
                            .filter(Boolean)
                            .join(" ")}
                        </Td>
                        <Td>{entry.count ?? ""}</Td>
                        <Td>{entry.message ?? ""}</Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th className="px-3 py-2 font-semibold">{children}</th>;
}

function Td({ children }: { children: ReactNode }) {
  return <td className="px-3 py-2 align-top text-gray-700 dark:text-gray-300">{children}</td>;
}

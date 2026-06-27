"use client";

import { useCallback } from "react";

interface ServerSelectorProps {
  profileId: string;
  servers: string[];
  activeServerIndex: number;
  onServerChange: (index: number) => void;
}

export default function ServerSelector({
  profileId,
  servers,
  activeServerIndex,
  onServerChange,
}: ServerSelectorProps) {
  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const index = Number(e.target.value);
      try {
        await fetch("/api/config", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: profileId, activeServerIndex: index }),
        });
        onServerChange(index);
      } catch {
        /* ignore */
      }
    },
    [profileId, onServerChange],
  );

  if (servers.length === 0) return null;

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-gray-500 dark:text-gray-400">Server:</span>
      <select
        value={activeServerIndex}
        onChange={handleChange}
        className="rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
      >
        {servers.map((url, i) => (
          <option key={i} value={i}>
            {new URL(url).host}
          </option>
        ))}
      </select>
    </label>
  );
}

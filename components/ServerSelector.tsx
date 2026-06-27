"use client";

import { useCallback, useEffect, useState } from "react";

interface Server {
  id: number;
  url: string;
}

interface ServerSelectorProps {
  profileId: string;
  activeServerIndex: number;
  onServerChange: (index: number) => void;
}

export default function ServerSelector({
  profileId,
  activeServerIndex,
  onServerChange,
}: ServerSelectorProps) {
  const [servers, setServers] = useState<Server[]>([]);

  useEffect(() => {
    fetch("/api/servers")
      .then((r) => r.json())
      .then(setServers)
      .catch(() => {});
  }, []);

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
    <select
      value={activeServerIndex}
      onChange={handleChange}
      className="rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
    >
      {servers.map((s) => (
        <option key={s.id} value={s.id - 1}>
          Server {s.id}
        </option>
      ))}
    </select>
  );
}

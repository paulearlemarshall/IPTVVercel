"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

interface CatalogUpdateButtonsProps {
  profileId?: string;
  onStatus?: (status: string) => void;
}

const BUTTONS = [
  { key: "all", label: "All" },
  { key: "vod", label: "VOD" },
  { key: "live", label: "Live" },
  { key: "series", label: "Series" },
];

export default function CatalogUpdateButtons({ profileId, onStatus }: CatalogUpdateButtonsProps) {
  const [running, setRunning] = useState<string | null>(null);

  const runUpdate = async (section: string) => {
    if (!profileId || running) return;
    setRunning(section);
    onStatus?.(`Updating ${section} catalogue...`);
    try {
      const res = await fetch("/api/catalog-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, section }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const total = Object.values(data.summary ?? {}).reduce(
        (sum: number, row: any) => sum + (row.streams ?? 0),
        0,
      );
      onStatus?.(`Updated ${section}: ${total} streams cached.`);
    } catch (error) {
      onStatus?.(`Update failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="flex items-center gap-1">
      {BUTTONS.map((button) => (
        <button
          key={button.key}
          type="button"
          onClick={() => runUpdate(button.key)}
          disabled={!profileId || Boolean(running)}
          title={`Update ${button.label}`}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        >
          <RefreshCw size={12} className={running === button.key ? "animate-spin" : ""} />
          {button.label}
        </button>
      ))}
    </div>
  );
}

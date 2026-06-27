"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

interface CatalogUpdateButtonsProps {
  englishOnly?: boolean;
  profileId?: string;
  onStatus?: (status: string) => void;
}

const BUTTONS = [
  { key: "all", label: "All" },
  { key: "vod", label: "VOD" },
  { key: "live", label: "Live" },
  { key: "series", label: "Series" },
];

export default function CatalogUpdateButtons({ englishOnly, profileId, onStatus }: CatalogUpdateButtonsProps) {
  const [running, setRunning] = useState<string | null>(null);
  const [progress, setProgress] = useState("Idle");

  const runUpdate = async (section: string) => {
    if (!profileId || running) return;
    setRunning(section);
    setProgress(`Starting ${section}...`);
    onStatus?.(`Updating ${section} catalogue...`);
    try {
      const res = await fetch("/api/catalog-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, section, englishOnly }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.message) {
            setProgress(event.message);
            onStatus?.(event.message);
          }
          if (event.type === "done") {
            const total = Object.values(event.summary ?? {}).reduce(
              (sum: number, row: any) => sum + (row.streams ?? 0),
              0,
            );
            const message = `Updated ${section}: ${total} streams cached.`;
            setProgress(message);
            onStatus?.(message);
          }
          if (event.type === "error") {
            throw new Error(event.message ?? "Update failed");
          }
        }
      }
    } catch (error) {
      const message = `Update failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setProgress(message);
      onStatus?.(message);
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-2">
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
      <span className="max-w-[28rem] truncate text-xs text-gray-500 dark:text-gray-400" title={progress}>
        {progress}
      </span>
    </div>
  );
}

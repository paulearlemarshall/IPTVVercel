"use client";

import { useEffect, useRef, useState } from "react";

interface StreamTooltipProps {
  stream: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  isLoading: boolean;
  mouseX: number;
  mouseY: number;
  onClose: () => void;
}

export default function StreamTooltip({
  stream,
  metadata,
  isLoading,
  mouseX,
  mouseY,
  onClose,
}: StreamTooltipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const w = window.innerWidth;
    const h = window.innerHeight;

    let left = mouseX + 12;
    let top = mouseY + 12;

    if (left + rect.width > w) left = mouseX - rect.width - 12;
    if (top + rect.height > h) top = h - rect.height - 12;
    if (top < 4) top = 4;

    setPos({ top, left });
  }, [mouseX, mouseY, metadata, isLoading]);

  const logo =
    (stream.stream_icon as string) ||
    (stream.cover as string) ||
    (metadata?.movie_image as string) ||
    "";

  const name = (stream.name ?? stream.title ?? "Untitled") as string;
  const ext = (stream.container_extension as string) || "";
  const filename = ext ? `${name}.${ext}` : name;
  const year = metadata?.releasedate
    ? (metadata.releasedate as string).split("-")[0]
    : metadata?.release_date
      ? (metadata.release_date as string).split("-")[0]
      : "";
  const rating = metadata?.rating ? parseFloat(metadata.rating as string) : 0;
  const duration =
    metadata?.duration_secs
      ? `${Math.floor((metadata.duration_secs as number) / 60)}m`
      : (metadata?.duration as string) || "";
  const plot = (metadata?.plot as string) || (metadata?.description as string) || "";
  const cast = (metadata?.cast as string) || "";
  const director = (metadata?.director as string) || "";
  const genre = (metadata?.genre as string) || "";

  const [copied, setCopied] = useState(false);

  const copyFilename = async () => {
    try {
      await navigator.clipboard.writeText(filename);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={ref}
        className="fixed z-50 w-80 rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800"
        style={{ top: pos.top, left: pos.left }}
      >
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-sm text-gray-400">
            Loading...
          </div>
        ) : (
          <div className="p-3">
            {logo && (
              <img
                src={logo}
                alt=""
                className="mb-2 h-32 w-full rounded object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            <div className="mb-1 text-sm font-bold text-blue-600 dark:text-blue-400">
              {name}
            </div>

            <div className="mb-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <span className="truncate font-mono">{filename}</span>
              <button
                onClick={copyFilename}
                title="Copy filename"
                className="shrink-0 rounded px-1 py-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
              >
                {copied ? "✓" : "⎘"}
              </button>
            </div>

            <div className="mb-2 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
              {rating > 0 && <span>★ {rating.toFixed(1)}</span>}
              {year && <span>{year}</span>}
              {duration && <span>{duration}</span>}
            </div>

            {genre && (
              <div className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                <strong>Genre:</strong> {genre}
              </div>
            )}

            {plot && (
              <div className="mb-2 max-h-24 overflow-y-auto text-xs leading-relaxed text-gray-700 dark:text-gray-300">
                {plot}
              </div>
            )}

            {director && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                <strong>Director:</strong> {director}
              </div>
            )}

            {cast && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                <strong>Cast:</strong> {cast}
              </div>
            )}

            {!metadata && (
              <div className="text-xs italic text-gray-400">No metadata available</div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

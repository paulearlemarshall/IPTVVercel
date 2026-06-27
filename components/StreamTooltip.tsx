"use client";

import { useEffect, useRef, useState } from "react";

interface StreamTooltipProps {
  stream: Record<string, unknown>;
  streamUrl: string;
  metadata: Record<string, unknown> | null;
  isLoading: boolean;
  mouseX: number;
  mouseY: number;
}

export default function StreamTooltip({
  stream,
  streamUrl,
  metadata,
  isLoading,
  mouseX,
  mouseY,
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
  }, [mouseX, mouseY, metadata, isLoading, streamUrl]);

  const name = (stream.name ?? stream.title ?? "Untitled") as string;
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

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(streamUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  return (
    <>
      <div
        ref={ref}
        className="fixed z-50 w-96 rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800"
        style={{ top: pos.top, left: pos.left }}
      >
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-sm text-gray-400">
            Loading...
          </div>
        ) : (
          <div className="p-3">
            <div className="mb-1 text-sm font-bold text-blue-600 dark:text-blue-400">
              {name}
            </div>

            {streamUrl && (
              <div className="mb-2 rounded bg-gray-50 p-1.5 dark:bg-gray-700/50">
                <div className="mb-1 flex items-center gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    Stream URL
                  </span>
                  <button
                    onClick={copyUrl}
                    title="Copy stream URL"
                    className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-300"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="break-all font-mono text-[11px] leading-relaxed text-gray-500 dark:text-gray-400 select-all">
                  {streamUrl}
                </p>
              </div>
            )}

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

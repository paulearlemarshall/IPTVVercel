"use client";

import { useEffect, useRef, useState } from "react";
import ReactPlayer from "react-player";
import mpegts from "mpegts.js";
import { X, AlertCircle, Copy } from "lucide-react";

interface VideoPlayerProps {
  url: string;
  title: string;
  onClose: () => void;
}

export default function VideoPlayer({ url, title, onClose }: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ res: "", speed: "", fps: "" });
  const [copied, setCopied] = useState(false);
  const [useTsPlayer, setUseTsPlayer] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    const lower = url.toLowerCase();
    setUseTsPlayer(lower.includes(".ts") || lower.includes("output=ts"));
  }, [url]);

  useEffect(() => {
    if (!useTsPlayer || !url || !videoRef.current) return;

    const video = videoRef.current;
    const mpegtsLib = (mpegts as any).default || mpegts;
    if (!mpegtsLib?.isSupported?.()) return;

    const inst = mpegtsLib.createPlayer(
      { type: "mpegts", isLive: true, url },
      { enableWorker: false, stashInitialSize: 128 },
    );

    inst.attachMediaElement(video);
    inst.load();

    inst.on("error", (_typ: any, details: string) => {
      if (details === "FormatUnsupported" || details === "MediaError") {
        setError("Format not supported (likely audio codec)");
      }
    });

    video.play();

    const ival = setInterval(() => {
      const info = (inst as any).statisticsInfo;
      if (!info) return;
      const res = video.videoWidth && video.videoHeight
        ? `${video.videoWidth}x${video.videoHeight}` : "";
      const speed = info.speed > 0
        ? `${((info.speed * 8) / 1000).toFixed(2)} Mbps` : "";
      const fps = info.decodedFrames > 0
        ? `${info.decodedFrames.toFixed(1)} fps` : "";
      setStats({ res, speed, fps });
    }, 1000);

    return () => {
      clearInterval(ival);
      inst.pause();
      inst.unload();
      inst.detachMediaElement();
      inst.destroy();
    };
  }, [useTsPlayer, url]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90">
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-[10000] flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30"
        title="Close (Esc)"
      >
        <X size={28} />
      </button>

      <div className="relative flex h-full w-full flex-col">
        <div className="flex items-center justify-between px-4 py-2 text-white">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-bold">{title}</span>
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase text-gray-400">
              {useTsPlayer ? "mpegts" : "react-player"}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-300">
            {stats.res && <span>{stats.res}</span>}
            {stats.fps && <span>{stats.fps}</span>}
            {stats.speed && <span className="text-blue-400">{stats.speed}</span>}
          </div>
        </div>

        <div className="relative flex flex-1 items-center justify-center bg-black">
          {error && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 p-8 text-center text-white">
              <AlertCircle size={48} className="text-red-400" />
              <p className="max-w-md text-lg">{error}</p>
              <button
                onClick={copyUrl}
                className="flex items-center gap-2 rounded bg-white/10 px-4 py-2 text-sm transition-colors hover:bg-white/20"
              >
                <Copy size={14} />
                {copied ? "Copied!" : "Copy Stream URL"}
              </button>
            </div>
          )}

          <div ref={containerRef} className="h-full w-full">
            {!useTsPlayer ? (
              <ReactPlayer
                src={url}
                controls
                playing
                width="100%"
                height="100%"
                config={{
                  hls: { enableWorker: false },
                  html: { crossOrigin: "anonymous" },
                }}
                onError={(e: any) => {
                  const msg = e?.message || e?.type || "Unknown error";
                  setError(`Playback failed: ${msg}`);
                }}
                style={{ position: "absolute", top: 0, left: 0 }}
              />
            ) : (
              <video
                ref={videoRef}
                controls
                autoPlay
                className="h-full w-full"
                crossOrigin="anonymous"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

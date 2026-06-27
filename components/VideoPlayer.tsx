"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import mpegts from "mpegts.js";
import { X, AlertCircle, Copy } from "lucide-react";

interface VideoPlayerProps {
  url: string;
  title: string;
  onClose: () => void;
}

type PlayerMethod = "hls" | "mpegts" | "native" | "unavailable";

const UNSUPPORTED_EXTENSIONS = new Set([
  "mkv", "avi", "wmv", "flv", "mov", "webm", "ogg", "ogv",
]);

export default function VideoPlayer({ url, title, onClose }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ res: "", speed: "", fps: "" });
  const [method, setMethod] = useState<PlayerMethod | null>(null);
  const [copied, setCopied] = useState(false);

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
    if (!url || !videoRef.current) return;

    const video = videoRef.current;
    let hlsInstance: Hls | null = null;
    let tsInstance: ReturnType<typeof mpegts.createPlayer> | null = null;
    let statsInterval: ReturnType<typeof setInterval> | undefined;
    let destroyed = false;

    const updateStats = () => {
      if (destroyed || !video) return;
      const res =
        video.videoWidth && video.videoHeight
          ? `${video.videoWidth}x${video.videoHeight}`
          : "";
      let speedStr = "";
      let fpsStr = "";

      if (tsInstance && (tsInstance as any).statisticsInfo) {
        const info = (tsInstance as any).statisticsInfo;
        if (info.speed > 0) speedStr = `${((info.speed * 8) / 1000).toFixed(2)} Mbps`;
        if (info.decodedFrames > 0) fpsStr = `${info.decodedFrames.toFixed(1)} fps`;
      } else if (hlsInstance) {
        if (hlsInstance.bandwidthEstimate) {
          speedStr = `${(hlsInstance.bandwidthEstimate / 1000 / 1000).toFixed(2)} Mbps`;
        }
        const level = hlsInstance.levels?.[hlsInstance.currentLevel];
        if (level?.bitrate) {
          speedStr = `${(level.bitrate / 1000 / 1000).toFixed(2)} Mbps`;
        }
      }
      setStats({ res, speed: speedStr, fps: fpsStr });
    };

    const probeAndPlay = async () => {
      try {
        setError(null);
        const lower = url.toLowerCase();
        const ext = lower.split(".").pop()?.split("?")[0] || "";
        const isM3U8 = lower.includes(".m3u8") || lower.includes("m3u8");
        const isTS = lower.includes(".ts") || lower.includes("output=ts");
        const isMP4 = ext === "mp4";

        let detectedMethod: PlayerMethod = "native";

        if (isM3U8) {
          detectedMethod = "hls";
        } else if (isTS) {
          detectedMethod = "mpegts";
        } else if (isMP4) {
          detectedMethod = "native";
        } else if (UNSUPPORTED_EXTENSIONS.has(ext)) {
          detectedMethod = "unavailable";
        } else {
          try {
            const head = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(3000) });
            const ct = head.headers.get("content-type") || "";
            if (ct.includes("mpegurl") || ct.includes("x-mpegurl") || ct.includes("hls")) {
              detectedMethod = "hls";
            } else if (ct.includes("mp2t") || ct.includes("mpegts")) {
              detectedMethod = "mpegts";
            } else if (ct.includes("mp4") || ct.includes("video/mp4")) {
              detectedMethod = "native";
            } else if (ct.startsWith("video/")) {
              detectedMethod = "native";
            }
          } catch {
            // probe failed, try native as fallback
          }
        }

        setMethod(detectedMethod);

        if (detectedMethod === "unavailable") {
          setError(`Format not supported in browser (${ext.toUpperCase()}). Use an external player.`);
          return;
        }

        if (detectedMethod === "hls") {
          if (Hls.isSupported()) {
            hlsInstance = new Hls({ enableWorker: false });
            hlsInstance.loadSource(url);
            hlsInstance.attachMedia(video);
          } else {
            video.src = url;
          }
        } else if (detectedMethod === "mpegts") {
          const mpegtsLib = (mpegts as any).default || mpegts;
          if (mpegtsLib?.isSupported?.()) {
            const inst = mpegtsLib.createPlayer(
              { type: "mpegts", isLive: true, url },
              { enableWorker: false, stashInitialSize: 128 },
            );
            tsInstance = inst;
            inst.attachMediaElement(video);
            inst.load();
            inst.on("error", (_typ: any, details: string) => {
              if (details === "FormatUnsupported" || details === "MediaError") {
                setError("Format not supported (likely audio codec)");
              }
            });
          } else {
            video.src = url;
          }
        } else {
          video.src = url;
        }

        await video.play();
        statsInterval = setInterval(updateStats, 1000);
      } catch (e: any) {
        console.warn("Playback error:", e);
        setError(`Playback failed: ${e.message}`);
      }
    };

    probeAndPlay();

    return () => {
      destroyed = true;
      if (statsInterval) clearInterval(statsInterval);
      if (hlsInstance) hlsInstance.destroy();
      if (tsInstance) {
        try {
          tsInstance.pause();
          tsInstance.unload();
          tsInstance.detachMediaElement();
          tsInstance.destroy();
        } catch { /* ignore */ }
      }
    };
  }, [url]);

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
            {method && (
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase text-gray-400">
                {method}
              </span>
            )}
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
          <video
            ref={videoRef}
            controls
            autoPlay
            className={`h-full w-full ${error ? "hidden" : "block"}`}
            crossOrigin="anonymous"
          />
        </div>
      </div>
    </div>
  );
}

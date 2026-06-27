"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import mpegts from "mpegts.js";
import { X, AlertCircle } from "lucide-react";

interface VideoPlayerProps {
  url: string;
  title: string;
  onClose: () => void;
}

export default function VideoPlayer({ url, title, onClose }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ res: "", speed: "", fps: "" });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
        if (info.speed > 0) {
          speedStr = `${((info.speed * 8) / 1000).toFixed(2)} Mbps`;
        }
        if (info.decodedFrames > 0) {
          fpsStr = `${info.decodedFrames.toFixed(1)} fps`;
        }
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

    const play = async () => {
      try {
        setError(null);
        const isM3U8 = url.toLowerCase().includes(".m3u8");
        const isTS =
          url.toLowerCase().includes(".ts") || url.includes("output=ts");

        if (isM3U8) {
          if (Hls.isSupported()) {
            hlsInstance = new Hls({ enableWorker: false });
            hlsInstance.loadSource(url);
            hlsInstance.attachMedia(video);
          } else {
            video.src = url;
          }
        } else if (isTS) {
          const mpegtsLib = (mpegts as any).default || mpegts;
          if (mpegtsLib?.isSupported?.()) {
            const inst = mpegtsLib.createPlayer(
              { type: "mpegts", isLive: true, url },
              { enableWorker: false, stashInitialSize: 128 },
            );
            tsInstance = inst;
            inst.attachMediaElement(video);
            inst.load();
            inst.on("error", (_type: any, details: string) => {
              if (
                details === "FormatUnsupported" ||
                details === "MediaError"
              ) {
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

    play();

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
          <span className="truncate text-sm font-bold">{title}</span>
          <div className="flex gap-4 text-xs text-gray-300">
            {stats.res && <span>{stats.res}</span>}
            {stats.fps && <span>{stats.fps}</span>}
            {stats.speed && <span className="text-blue-400">{stats.speed}</span>}
          </div>
        </div>

        <div className="relative flex flex-1 items-center justify-center bg-black">
          {error && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 text-white">
              <AlertCircle size={48} />
              <p className="max-w-md text-center text-lg">{error}</p>
            </div>
          )}
          <video
            ref={videoRef}
            controls
            className={`h-full w-full ${error ? "hidden" : "block"}`}
          />
        </div>
      </div>
    </div>
  );
}

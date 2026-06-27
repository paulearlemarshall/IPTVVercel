"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactPlayer from "react-player";
import Hls from "hls.js";
import mpegts from "mpegts.js";
import { AlertCircle, Copy, ExternalLink, SkipForward, X } from "lucide-react";

type PlayerTech = "auto" | "native" | "react-player" | "hls" | "mpegts" | "proxy";

interface VideoPlayerProps {
  url: string;
  proxyUrl?: string | null;
  profileId?: string;
  section?: string;
  streamId?: string;
  title: string;
  onClose: () => void;
}

const TECH_LABELS: Record<PlayerTech, string> = {
  auto: "Auto",
  native: "Native",
  "react-player": "ReactPlayer",
  hls: "HLS.js",
  mpegts: "MPEG-TS",
  proxy: "Proxy Native",
};

function detectTech(url: string): PlayerTech {
  const lower = url.toLowerCase();
  if (lower.includes(".m3u8")) return "hls";
  if (lower.includes(".ts") || lower.includes("output=ts")) return "mpegts";
  if (lower.match(/\.(mp4|m4v|webm|ogg|mov)(\?|$)/)) return "native";
  return "react-player";
}

function detectDefaultTech(url: string, proxyUrl?: string | null): PlayerTech {
  return proxyUrl ? "proxy" : detectTech(url);
}

function getPlayableUrl(tech: PlayerTech, directUrl: string, proxyUrl?: string | null) {
  return tech === "proxy" && proxyUrl ? proxyUrl : directUrl;
}

function getUrlExtension(url: string) {
  const path = url.split("?")[0] ?? "";
  const match = path.match(/\.([a-z0-9]{1,8})$/i);
  return match?.[1]?.toLowerCase() ?? "";
}

function getPlaybackHint(ext: string, tech: PlayerTech) {
  if (ext === "mkv") {
    return "MKV depends on browser container and codec support. If it still fails, the stream may need server-side transcoding or an external player.";
  }
  if (ext === "mp4" || ext === "m4v") {
    return "For MP4 playback, try Proxy Native when the provider blocks browser CORS or Range requests. The video still needs browser-supported codecs such as H.264 video and AAC audio.";
  }
  if (tech === "hls") {
    return "For HLS streams, failures are usually caused by playlist access, segment CORS, or unsupported codecs.";
  }
  if (tech === "mpegts") {
    return "For transport streams, MPEG-TS usually works best for live channels when the browser can decode the included audio and video codecs.";
  }
  return "Try Proxy Native for provider network restrictions, or switch engines when the stream format does not match the selected technology.";
}

function getNextTech(current: PlayerTech, techs: PlayerTech[]) {
  const playable = techs.filter((tech): tech is Exclude<PlayerTech, "auto"> => tech !== "auto");
  const index = current === "auto" ? -1 : playable.indexOf(current);
  return playable[(index + 1) % playable.length] ?? null;
}

export default function VideoPlayer({ url, proxyUrl, profileId, section, streamId, title, onClose }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [selectedTech, setSelectedTech] = useState<PlayerTech>("auto");
  const [activeTech, setActiveTech] = useState<PlayerTech>(() => detectDefaultTech(url, proxyUrl));
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ res: "", speed: "", fps: "" });
  const [copied, setCopied] = useState(false);
  const reportedSuccess = useRef<Set<string>>(new Set());

  const resolvedTech = useMemo<PlayerTech>(() => {
    if (selectedTech !== "auto") return selectedTech;
    return detectDefaultTech(url, proxyUrl);
  }, [selectedTech, url, proxyUrl]);

  const playbackUrl = getPlayableUrl(resolvedTech, url, proxyUrl);
  const sourceExtension = getUrlExtension(url);
  const playbackHint = getPlaybackHint(sourceExtension, resolvedTech);
  const availableTechs = useMemo<PlayerTech[]>(
    () => (proxyUrl ? ["auto", "proxy", "native", "react-player", "hls", "mpegts"] : ["auto", "native", "react-player", "hls", "mpegts"]),
    [proxyUrl],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setError(null);
    setStats({ res: "", speed: "", fps: "" });
    setActiveTech(resolvedTech);
  }, [resolvedTech, playbackUrl]);

  const copyUrl = async () => {
    try {
      const absoluteUrl = playbackUrl.startsWith("/")
        ? `${window.location.origin}${playbackUrl}`
        : playbackUrl;
      await navigator.clipboard.writeText(absoluteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const recordPlayback = async (tech: PlayerTech, status: "success" | "failure", message?: string) => {
    if (!profileId || !section || !streamId) return;
    try {
      await fetch("/api/playback-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, section, streamId, tech, status, message }),
      });
    } catch {
      /* ignore */
    }
  };

  const failPlayback = (message: string) => {
    setError(message);
    recordPlayback(resolvedTech, "failure", message);
  };

  const markPlayable = (tech: PlayerTech) => {
    setActiveTech(tech);
    if (reportedSuccess.current.has(tech)) return;
    reportedSuccess.current.add(tech);
    recordPlayback(tech, "success");
  };

  const tryNextTech = () => {
    const next = getNextTech(resolvedTech, availableTechs);
    if (!next) return;
    setSelectedTech(next);
  };

  const openInVlc = () => {
    const direct = encodeURIComponent(url);
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("android")) {
      window.location.href = `intent:${url}#Intent;package=org.videolan.vlc;type=video/*;end`;
      return;
    }
    if (/iphone|ipad|ipod/.test(ua)) {
      window.location.href = `vlc-x-callback://x-callback-url/stream?url=${direct}`;
      return;
    }
    window.location.href = `vlc://${url}`;
  };

  const downloadVlcPlaylist = () => {
    const playlist = `#EXTM3U\n#EXTINF:-1,${title.replace(/\r?\n/g, " ")}\n${url}\n`;
    const blob = new Blob([playlist], { type: "audio/x-mpegurl" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `${title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "stream"}.m3u`;
    link.click();
    URL.revokeObjectURL(href);
  };

  useEffect(() => {
    if (resolvedTech !== "hls" || !videoRef.current) return;

    const video = videoRef.current;
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = playbackUrl;
      video.play().catch(() => {});
      return () => {
        video.removeAttribute("src");
        video.load();
      };
    }

    if (!Hls.isSupported()) {
      failPlayback("HLS.js is not supported in this browser.");
      return;
    }

    const hls = new Hls({ enableWorker: false, lowLatencyMode: true });
    hls.loadSource(playbackUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) failPlayback(`HLS failed: ${data.details || data.type}`);
    });

    video.play().catch(() => {});

    return () => {
      hls.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [resolvedTech, playbackUrl]);

  useEffect(() => {
    if (resolvedTech !== "mpegts" || !videoRef.current) return;

    const video = videoRef.current;
    const mpegtsLib = (mpegts as any).default || mpegts;
    if (!mpegtsLib?.isSupported?.()) {
      failPlayback("MPEG-TS playback is not supported in this browser.");
      return;
    }

    const inst = mpegtsLib.createPlayer(
      { type: "mpegts", isLive: true, url: playbackUrl },
      { enableWorker: false, stashInitialSize: 128 },
    );

    inst.attachMediaElement(video);
    inst.load();
    inst.on("error", (_typ: unknown, details: string) => {
      failPlayback(`MPEG-TS failed: ${details || "unknown error"}`);
    });

    video.play().catch(() => {});

    const ival = setInterval(() => {
      const info = (inst as any).statisticsInfo;
      const res = video.videoWidth && video.videoHeight
        ? `${video.videoWidth}x${video.videoHeight}` : "";
      const speed = info?.speed > 0
        ? `${((info.speed * 8) / 1000).toFixed(2)} Mbps` : "";
      const fps = info?.decodedFrames > 0
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
  }, [resolvedTech, playbackUrl]);

  useEffect(() => {
    if (resolvedTech !== "native" && resolvedTech !== "proxy") return;
    const video = videoRef.current;
    if (!video) return;

    video.src = playbackUrl;
    video.play().catch(() => {});

    const ival = setInterval(() => {
      const res = video.videoWidth && video.videoHeight
        ? `${video.videoWidth}x${video.videoHeight}` : "";
      setStats((prev) => ({ ...prev, res }));
    }, 1000);

    return () => {
      clearInterval(ival);
      video.removeAttribute("src");
      video.load();
    };
  }, [resolvedTech, playbackUrl]);

  const videoError = () => {
    const mediaError = videoRef.current?.error;
    const msg = mediaError?.message || "The browser could not decode this stream.";
    failPlayback(`Playback failed: ${msg}`);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90">
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-[10000] flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white"
        title="Close (Esc)"
      >
        <X size={28} />
      </button>

      <div className="relative flex h-full w-full flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-2 text-white">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{title}</div>
            <div className="text-[11px] uppercase tracking-wide text-gray-400">
              In use: {TECH_LABELS[activeTech]}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex overflow-hidden rounded border border-white/15 bg-white/5">
              {availableTechs.map((tech) => {
                const active = selectedTech === tech;
                return (
                  <button
                    key={tech}
                    type="button"
                    onClick={() => setSelectedTech(tech)}
                    className={`px-2.5 py-1 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-white ${
                      active
                        ? "bg-blue-500 text-white"
                        : "text-gray-300 hover:bg-white/10 hover:text-white"
                    }`}
                    title={`Use ${TECH_LABELS[tech]}`}
                  >
                    {TECH_LABELS[tech]}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={openInVlc}
              className="flex items-center gap-1 rounded border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold text-gray-200 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
              title="Open direct stream URL in VLC"
            >
              <ExternalLink size={13} />
              VLC
            </button>
            <button
              type="button"
              onClick={downloadVlcPlaylist}
              className="flex items-center gap-1 rounded border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold text-gray-200 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
              title="Download an M3U playlist file for VLC"
            >
              <ExternalLink size={13} />
              M3U
            </button>
            <div className="flex items-center gap-4 text-xs text-gray-300">
              {stats.res && <span>{stats.res}</span>}
              {stats.fps && <span>{stats.fps}</span>}
              {stats.speed && <span className="text-blue-300">{stats.speed}</span>}
            </div>
          </div>
        </div>

        <div className="relative flex flex-1 items-center justify-center bg-black">
          {error && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/80 p-8 text-center text-white">
              <AlertCircle size={48} className="text-red-400" />
              <p className="max-w-md text-lg">{error}</p>
              <p className="max-w-md text-sm text-gray-300">
                {playbackHint}
              </p>
              <button
                onClick={copyUrl}
                className="flex items-center gap-2 rounded bg-white/10 px-4 py-2 text-sm transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white"
              >
                <Copy size={14} />
                {copied ? "Copied!" : "Copy Active URL"}
              </button>
              <button
                onClick={tryNextTech}
                className="flex items-center gap-2 rounded bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-400 focus:outline-none focus:ring-2 focus:ring-white"
              >
                <SkipForward size={14} />
                Try Next Engine
              </button>
            </div>
          )}

          <div className="relative h-full w-full">
            {resolvedTech === "react-player" ? (
              <ReactPlayer
                src={playbackUrl}
                controls
                playing
                width="100%"
                height="100%"
                onReady={() => markPlayable("react-player")}
                onError={(e: any) => {
                  const msg = e?.message || e?.type || "Unknown error";
                  failPlayback(`ReactPlayer failed: ${msg}`);
                }}
                style={{ position: "absolute", top: 0, left: 0 }}
              />
            ) : (
              <video
                key={`${resolvedTech}:${playbackUrl}`}
                ref={videoRef}
                controls
                autoPlay
                playsInline
                className="h-full w-full"
                onCanPlay={() => markPlayable(resolvedTech)}
                onError={videoError}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

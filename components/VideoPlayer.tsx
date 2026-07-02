"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactPlayer from "react-player";
import Hls from "hls.js";
import mpegts from "mpegts.js";
import { AlertCircle, Bug, Copy, ExternalLink, Loader2, SkipForward, X } from "lucide-react";

type PlayerTech = "auto" | "native" | "react-player" | "hls" | "mpegts" | "flv" | "proxy" | "transcode";

type TranscodeStatus = "idle" | "loading" | "running" | "done" | "error";

interface TranscodeState {
  status: TranscodeStatus;
  progress: number;
  message: string;
  url: string | null;
}

interface AttemptEntry {
  tech: PlayerTech;
  status: "trying" | "playing" | "failed";
  ms: number;
  message?: string;
}

const FFMPEG_CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";

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
  flv: "FLV",
  proxy: "Proxy Native",
  transcode: "MKV→MP4",
};

function getUrlExtension(url: string) {
  const path = url.split("?")[0] ?? "";
  const match = path.match(/\.([a-z0-9]{1,8})$/i);
  return match?.[1]?.toLowerCase() ?? "";
}

// Ordered engine ladders per source shape. In Auto mode a playback failure
// advances to the next engine automatically; the order reflects what is most
// likely to succeed first so the user sees video with minimal delay.
// The heavy in-browser transcode is only auto-attempted for containers that
// browsers genuinely cannot demux (MKV/AVI); everywhere else it stays manual.
function getLadder(url: string, proxyUrl?: string | null, section?: string): Exclude<PlayerTech, "auto">[] {
  const lower = url.toLowerCase();
  const ext = getUrlExtension(url);
  const withProxy = <T extends Exclude<PlayerTech, "auto">[]>(ladder: T) =>
    proxyUrl ? ladder : (ladder.filter((tech) => tech !== "proxy") as T);

  if (lower.includes(".m3u8")) {
    return withProxy(["hls", "react-player", "mpegts", "native", "proxy"]);
  }
  if (ext === "mkv" || ext === "avi") {
    // Chromium can often demux Matroska via its WebM parser — try direct
    // playback (proxied first to dodge CORS/Range issues) before converting.
    return withProxy(["proxy", "native", "transcode", "react-player"]);
  }
  if (ext === "flv") {
    return withProxy(["flv", "mpegts", "proxy", "react-player"]);
  }
  if (ext === "ts" || lower.includes("output=ts") || section === "live") {
    return withProxy(["mpegts", "hls", "proxy", "native", "react-player"]);
  }
  if (/^(mp4|m4v|webm|ogg|mov)$/.test(ext)) {
    return withProxy(["proxy", "native", "react-player", "hls"]);
  }
  // Unknown shape: let ReactPlayer sniff it, then work through the rest.
  return withProxy(["react-player", "hls", "mpegts", "proxy", "native"]);
}

export default function VideoPlayer({ url, proxyUrl, profileId, section, streamId, title, onClose }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [selectedTech, setSelectedTech] = useState<PlayerTech>("auto");
  const ladder = useMemo(() => getLadder(url, proxyUrl, section), [url, proxyUrl, section]);
  const [autoIndex, setAutoIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ res: "", speed: "", fps: "" });
  const [copied, setCopied] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [attempts, setAttempts] = useState<AttemptEntry[]>([]);
  const attemptStartedAt = useRef(0);
  const [transcode, setTranscode] = useState<TranscodeState>({
    status: "idle",
    progress: 0,
    message: "",
    url: null,
  });
  const reportedSuccess = useRef<Set<string>>(new Set());

  const isAuto = selectedTech === "auto";
  const resolvedTech = useMemo<Exclude<PlayerTech, "auto">>(() => {
    if (!isAuto) return selectedTech as Exclude<PlayerTech, "auto">;
    return ladder[Math.min(autoIndex, ladder.length - 1)];
  }, [isAuto, selectedTech, ladder, autoIndex]);

  const playbackUrl = resolvedTech === "proxy" && proxyUrl ? proxyUrl : url;
  const sourceExtension = getUrlExtension(url);
  const availableTechs = useMemo<PlayerTech[]>(
    () => (proxyUrl
      ? ["auto", "proxy", "native", "react-player", "hls", "mpegts", "flv", "transcode"]
      : ["auto", "native", "react-player", "hls", "mpegts", "flv", "transcode"]),
    [proxyUrl],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Reset per-attempt state and start the attempt timer whenever the engine
  // or URL changes.
  useEffect(() => {
    setError(null);
    setStats({ res: "", speed: "", fps: "" });
    setTranscode({ status: "idle", progress: 0, message: "", url: null });
    attemptStartedAt.current = performance.now();
    setAttempts((prev) => [...prev, { tech: resolvedTech, status: "trying", ms: 0 }]);
    console.debug(`[player] attempt tech=${resolvedTech} url=${playbackUrl}`);
  }, [resolvedTech, playbackUrl]);

  const elapsed = () => Math.round(performance.now() - attemptStartedAt.current);

  const finishAttempt = useCallback((status: "playing" | "failed", message?: string) => {
    const ms = elapsed();
    setAttempts((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].status === "trying") {
          next[i] = { ...next[i], status, ms, message };
          break;
        }
      }
      return next;
    });
    console.debug(`[player] ${status} tech=${resolvedTech} after ${ms}ms${message ? ` — ${message}` : ""}`);
  }, [resolvedTech]);

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

  const failPlayback = useCallback((message: string) => {
    finishAttempt("failed", message);
    recordPlayback(resolvedTech, "failure", message);
    // Auto mode walks the ladder before surfacing an error to the user.
    if (isAuto && autoIndex < ladder.length - 1) {
      setAutoIndex((i) => i + 1);
      return;
    }
    setError(message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishAttempt, resolvedTech, isAuto, autoIndex, ladder.length]);

  const markPlayable = (tech: Exclude<PlayerTech, "auto">) => {
    finishAttempt("playing");
    if (reportedSuccess.current.has(tech)) return;
    reportedSuccess.current.add(tech);
    recordPlayback(tech, "success");
  };

  const tryNextTech = () => {
    if (isAuto) {
      setAutoIndex((i) => Math.min(i + 1, ladder.length - 1));
      setError(null);
      return;
    }
    const playable = availableTechs.filter((tech): tech is Exclude<PlayerTech, "auto"> => tech !== "auto");
    const index = playable.indexOf(resolvedTech);
    setSelectedTech(playable[(index + 1) % playable.length]);
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

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      // IPTV playlists and segments are often slow or flaky; retry harder
      // before declaring a fatal error.
      manifestLoadingMaxRetry: 3,
      levelLoadingMaxRetry: 4,
      fragLoadingMaxRetry: 6,
      manifestLoadingRetryDelay: 500,
      fragLoadingRetryDelay: 500,
    });
    hls.loadSource(playbackUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      // Recoverable fatal errors: try hls.js built-in recovery once before
      // failing over to the next engine.
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError();
        return;
      }
      failPlayback(`HLS failed: ${data.details || data.type}`);
    });

    video.play().catch(() => {});

    return () => {
      hls.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [resolvedTech, playbackUrl]);

  // mpegts.js drives both raw transport streams and FLV (same demux pipeline).
  useEffect(() => {
    if ((resolvedTech !== "mpegts" && resolvedTech !== "flv") || !videoRef.current) return;

    const video = videoRef.current;
    const mpegtsLib = (mpegts as any).default || mpegts;
    if (!mpegtsLib?.isSupported?.()) {
      failPlayback("MPEG-TS/FLV playback is not supported in this browser.");
      return;
    }

    const inst = mpegtsLib.createPlayer(
      {
        type: resolvedTech === "flv" ? "flv" : "mpegts",
        isLive: section === "live",
        url: playbackUrl,
      },
      {
        enableWorker: false,
        stashInitialSize: 128,
        liveBufferLatencyChasing: section === "live",
      },
    );

    inst.attachMediaElement(video);
    inst.load();
    inst.on("error", (_typ: unknown, details: string) => {
      failPlayback(`${resolvedTech === "flv" ? "FLV" : "MPEG-TS"} failed: ${details || "unknown error"}`);
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
  }, [resolvedTech, playbackUrl, section]);

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

  // In-browser MKV/AVI → MP4 conversion via ffmpeg.wasm. Browsers can usually
  // decode the codecs inside an MKV (H.264/AAC) but not the Matroska container,
  // so we remux to MP4 (copying video, re-encoding audio to AAC) entirely
  // client-side. The single-threaded core needs no special COOP/COEP headers.
  useEffect(() => {
    if (resolvedTech !== "transcode") return;

    let cancelled = false;
    let objectUrl: string | null = null;
    let ffmpeg: { terminate?: () => void } | null = null;

    (async () => {
      try {
        setTranscode({ status: "loading", progress: 0, message: "Loading converter…", url: null });
        const [{ FFmpeg }, { fetchFile, toBlobURL }] = await Promise.all([
          import("@ffmpeg/ffmpeg"),
          import("@ffmpeg/util"),
        ]);

        const ff = new FFmpeg();
        ffmpeg = ff;
        ff.on("progress", ({ progress }: { progress: number }) => {
          if (cancelled) return;
          setTranscode((prev) => ({
            ...prev,
            status: "running",
            progress: Math.max(0, Math.min(100, Math.round(progress * 100))),
          }));
        });

        await ff.load({
          coreURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
        });
        if (cancelled) return;

        setTranscode((prev) => ({ ...prev, status: "running", message: "Downloading stream…" }));
        const source = proxyUrl || url;
        await ff.writeFile("input.mkv", await fetchFile(source));
        if (cancelled) return;

        setTranscode((prev) => ({ ...prev, message: "Converting to MP4…" }));
        await ff.exec([
          "-i", "input.mkv",
          "-c:v", "copy",
          "-c:a", "aac",
          "-movflags", "+faststart",
          "output.mp4",
        ]);
        if (cancelled) return;

        const data = await ff.readFile("output.mp4");
        const blob = new Blob([data as unknown as BlobPart], { type: "video/mp4" });
        objectUrl = URL.createObjectURL(blob);
        setTranscode({ status: "done", progress: 100, message: "", url: objectUrl });
      } catch (e) {
        if (cancelled) return;
        setTranscode({ status: "error", progress: 0, message: "", url: null });
        failPlayback(
          `In-browser conversion failed: ${(e as Error)?.message || "unknown error"}. Large or HEVC/4K files may exceed browser memory — try VLC instead.`,
        );
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      try {
        ffmpeg?.terminate?.();
      } catch {
        /* ignore */
      }
    };
  }, [resolvedTech, proxyUrl, url]);

  // Attach the converted MP4 to the video element once ready.
  useEffect(() => {
    if (resolvedTech !== "transcode") return;
    const video = videoRef.current;
    if (!video || transcode.status !== "done" || !transcode.url) return;
    video.src = transcode.url;
    video.play().catch(() => {});
    return () => {
      video.removeAttribute("src");
      video.load();
    };
  }, [resolvedTech, transcode.status, transcode.url]);

  const videoError = () => {
    const mediaError = videoRef.current?.error;
    const msg = mediaError?.message || "The browser could not decode this stream.";
    failPlayback(`Playback failed: ${msg}`);
  };

  const playbackHint = (() => {
    if (sourceExtension === "mkv" || sourceExtension === "avi") {
      return "Browsers cannot always demux this container. The MKV→MP4 engine converts it in your browser (best for smaller H.264 VOD); use VLC for large/HEVC files.";
    }
    if (resolvedTech === "hls") {
      return "For HLS streams, failures are usually caused by playlist access, segment CORS, or unsupported codecs.";
    }
    if (resolvedTech === "mpegts" || resolvedTech === "flv") {
      return "Transport streams work best for live channels when the browser can decode the included audio and video codecs.";
    }
    return "Try Proxy Native for provider network restrictions, or switch engines when the stream format does not match the selected technology.";
  })();

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
              In use: {TECH_LABELS[resolvedTech]}
              {isAuto && ladder.length > 1 && ` (auto ${autoIndex + 1}/${ladder.length})`}
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
                    onClick={() => {
                      setSelectedTech(tech);
                      if (tech === "auto") setAutoIndex(0);
                    }}
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
            <button
              type="button"
              onClick={() => setShowDebug((v) => !v)}
              className={`flex items-center gap-1 rounded border border-white/15 px-2.5 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-white ${
                showDebug ? "bg-blue-500 text-white" : "bg-white/5 text-gray-200 hover:bg-white/10"
              }`}
              title="Show engine attempt log"
            >
              <Bug size={13} />
            </button>
            <div className="flex items-center gap-4 text-xs text-gray-300">
              {stats.res && <span>{stats.res}</span>}
              {stats.fps && <span>{stats.fps}</span>}
              {stats.speed && <span className="text-blue-300">{stats.speed}</span>}
            </div>
          </div>
        </div>

        <div className="relative flex flex-1 items-center justify-center bg-black">
          {showDebug && (
            <div className="absolute left-4 top-4 z-30 max-h-64 w-80 overflow-y-auto rounded border border-white/15 bg-black/85 p-3 font-mono text-[11px] text-gray-300">
              <div className="mb-1 font-bold text-white">Engine attempts</div>
              {attempts.map((a, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <span>{TECH_LABELS[a.tech]}</span>
                  <span
                    className={
                      a.status === "playing"
                        ? "text-green-400"
                        : a.status === "failed"
                          ? "text-red-400"
                          : "text-yellow-300"
                    }
                  >
                    {a.status}
                    {a.ms > 0 && ` ${a.ms}ms`}
                  </span>
                </div>
              ))}
              {attempts.some((a) => a.message) && (
                <div className="mt-2 border-t border-white/10 pt-1 text-red-300">
                  {attempts.filter((a) => a.message).map((a, i) => (
                    <div key={i}>{TECH_LABELS[a.tech]}: {a.message}</div>
                  ))}
                </div>
              )}
            </div>
          )}

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

          {resolvedTech === "transcode" && (transcode.status === "loading" || transcode.status === "running") && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/85 p-8 text-center text-white">
              <Loader2 size={40} className="animate-spin text-blue-400" />
              <p className="text-lg">{transcode.message || "Converting…"}</p>
              {transcode.status === "running" && transcode.progress > 0 && (
                <div className="h-2 w-64 overflow-hidden rounded bg-white/20">
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{ width: `${transcode.progress}%` }}
                  />
                </div>
              )}
              <p className="max-w-md text-xs text-gray-400">
                Converting the whole file in your browser. Best for smaller H.264 MKV/AVI VOD;
                large or HEVC/4K files may run out of memory — use VLC for those.
              </p>
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

"use client";

import { useEffect, useRef, useState } from "react";
import mpegts from "mpegts.js";

const HELPER = "http://127.0.0.1:19876";

export default function LocalVideoPlayer({ url, mode, onStatus }: { url: string; mode: "remux" | "compatible"; onStatus: (message: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playing = useRef(false);
  const [message, setMessage] = useState("Connecting to the helper on this PC…");
  const statusRef = useRef(onStatus);
  useEffect(() => { statusRef.current = onStatus; });
  useEffect(() => { statusRef.current(message); }, [message]);
  useEffect(() => {
    let disposed = false;
    let sessionId: string | undefined;
    let player: ReturnType<typeof mpegts.createPlayer> | undefined;
    playing.current = false;
    const removeSession = (id: string) => fetch(`${HELPER}/sessions/${id}`, { method: "DELETE", keepalive: true }).catch(() => {});
    setMessage("Connecting to the helper on this PC…");
    const startup = window.setTimeout(() => {
      if (!disposed && !playing.current) setMessage("Still waiting for video. Check that FFmpeg can reach the provider, or try Local compatibility.");
    }, 30000);
    (async () => {
      try {
        if (!mpegts.isSupported()) throw new Error("Local playback needs a browser with Media Source support, such as desktop Chrome or Edge.");
        const response = await fetch(`${HELPER}/sessions`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, mode }), signal: AbortSignal.timeout(10000),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Helper rejected the stream.");
        sessionId = result.id;
        if (disposed) { await removeSession(result.id); return; }
        player = mpegts.createPlayer({ type: "mpegts", isLive: true, url: `${HELPER}/sessions/${result.id}/stream` }, { enableWorker: false });
        player.on(mpegts.Events.ERROR, () => {
          if (!disposed) setMessage("Local stream failed. Try Local compatibility; also check the provider and your FFmpeg installation.");
        });
        player.attachMediaElement(videoRef.current!);
        player.load();
        setMessage("Preparing video locally…");
        videoRef.current!.play().catch(() => { if (!disposed) setMessage("Press Play to start local video."); });
      } catch (error) {
        if (!disposed) setMessage(error instanceof TypeError
          ? "Cannot connect to the local helper. Run npm run player:local on this PC, configure this website’s origin, and allow local-network access if prompted."
          : error instanceof Error ? error.message : "Local playback failed.");
      }
    })();
    return () => {
      disposed = true;
      window.clearTimeout(startup);
      player?.destroy();
      if (sessionId) void removeSession(sessionId);
    };
  }, [url, mode]);
  return <div className="flex h-full w-full flex-col">
    <p className="px-4 py-2 text-sm text-white" role="status">{message || "Playing through this PC · no Vercel video bandwidth"}</p>
    <p className="px-4 text-xs text-gray-300">Local streaming starts from the beginning; seeking and subtitles are not supported yet. Compatibility mode uses more CPU.</p>
    <video ref={videoRef} controls autoPlay playsInline className="min-h-0 flex-1 w-full" onPlaying={() => { playing.current = true; setMessage(""); }} />
  </div>;
}

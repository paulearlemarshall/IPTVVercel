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
  return <div className="flex h-full min-h-0 w-full flex-col">
    <div className="shrink-0 border-b border-white/10 px-3 py-1 text-xs text-gray-200 sm:px-4">
      <p role="status">{message || "Playing locally · no Vercel video bandwidth"}</p>
      <details className="mt-0.5 text-gray-400">
        <summary className="w-fit cursor-pointer rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">Local playback notes</summary>
        <p>Starts from the beginning; seeking and subtitles are not supported yet. Compatibility mode uses more CPU.</p>
      </details>
    </div>
    <div className="relative min-h-0 flex-1">
      <video ref={videoRef} controls autoPlay playsInline className="absolute inset-0 h-full w-full object-contain" onPlaying={() => { playing.current = true; setMessage(""); }} />
    </div>
  </div>;
}

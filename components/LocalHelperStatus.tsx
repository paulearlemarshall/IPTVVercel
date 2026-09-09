"use client";

import { useId, useState } from "react";
import { checkLocalHelper, LOCAL_HELPER_URL, useLocalHelperStatus } from "@/hooks/useLocalHelperStatus";

export default function LocalHelperStatus({ onDark = false }: { onDark?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const state = useLocalHelperStatus(hovered || focused);
  const tooltip = useId();
  const health = state.health;
  const label = { ready: "Helper ready", checking: "Checking helper", unavailable: "Helper unreachable", attention: "Helper needs attention", outdated: "Helper update needed" }[state.status];
  const color = state.status === "ready" ? "bg-green-500" : state.status === "checking" ? "bg-gray-400" : state.status === "outdated" ? "bg-amber-500" : "bg-red-500";
  const metric = (value: number | null | undefined, unit = "") => typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)}${unit}` : "unknown";
  return <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setFocused(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }} className={`group relative flex items-center gap-1 text-xs ${onDark ? "text-white" : "text-gray-900 dark:text-white"}`}>
    <a href={`${LOCAL_HELPER_URL}/`} target="_blank" rel="noopener noreferrer" aria-describedby={tooltip} className="flex items-center gap-2 rounded border border-current/25 px-2 py-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500" title={`${label} — IP 127.0.0.1 · port 19876 · click for local status page`}>
      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${color}`} />{label}
    </a>
    <button type="button" onClick={() => void checkLocalHelper()} disabled={state.status === "checking"} className="rounded px-1.5 py-1.5 underline disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500" aria-label="Retry local helper detection">Retry</button>
    <div id={tooltip} role="tooltip" className="absolute right-0 top-full z-[10010] hidden max-h-[70dvh] w-[min(27rem,85vw)] overflow-y-auto whitespace-normal rounded-lg border border-gray-600 bg-gray-950 p-3 text-left text-xs leading-relaxed text-gray-100 shadow-xl group-hover:block group-focus-within:block">
      <p className="font-semibold">{label} · HTTP 127.0.0.1:19876</p>
      <p className="mt-1">{state.detail}</p>
      {health && <>
        <p className="mt-2">Helper {health.helperVersion} · FFmpeg {health.ffmpeg.version || "unavailable"}</p>
        <p>AAC: {health.ffmpeg.aac ? "yes" : "no"} · H.264: {health.ffmpeg.h264 ? "yes" : "no"}</p>
        <p>{health.system.platform} / {health.system.arch} · Node {health.system.node}</p>
        <p>Uptime: {Math.floor(health.system.helperUptimeSeconds / 60)} min · Free RAM: {health.system.freeMemoryMB} MB</p>
        <p>Streams: {health.sessions.active} · Session slots: {health.sessions.allocated}/{health.sessions.limit}</p>
        <p>Configured provider hosts: {health.configuration.providerHosts.length}</p>
        {health.telemetrySchema === 1 ? <>
          <p>Lifetime output: {metric((health.transfer?.bytesSent || 0) / 1048576, " MiB")} · Starts: {health.transfer?.streamsStarted || 0}</p>
          {!health.streams?.length && <p className="mt-2">No local streams. Direct/Vercel playback is not measured here.</p>}
          {health.streams?.map(stream => <div key={stream.number} className="mt-2 border-t border-gray-600 pt-2">
            <p className="font-semibold">Stream {stream.number} · {stream.mode} · {stream.state}</p>
            <p className="break-all">{stream.source}</p>
            <p>Input: {stream.input?.container || stream.extension || "unknown"} · {stream.input?.videoCodec || "unknown video"} / {stream.input?.audioCodec || "no/unknown audio"}</p>
            <p>{stream.input?.resolution || "unknown resolution"} · Source {metric(stream.input?.fps, " fps")}</p>
            <p>Output: {stream.output?.videoCodec || "unknown"} / {stream.output?.audioCodec || "no/unknown audio"} · MPEG-TS</p>
            <p>Current {metric(stream.currentMbps, " Mbps")} · Avg {metric(stream.averageMbps, " Mbps")} · Peak {metric(stream.peakMbps, " Mbps")}</p>
            <p>Sent {metric(stream.bytesSent / 1048576, " MiB")} · Elapsed {stream.elapsedSeconds ?? 0}s</p>
            <p>Processed frames {stream.frames ?? "unknown"} · {metric(stream.processingFps, " processing fps")} · {metric(stream.speed, "×")}</p>
            <p>Media {metric(stream.mediaSeconds, "s")} · Dropped {stream.droppedFrames ?? "unknown"} / duplicated {stream.duplicatedFrames ?? "unknown"}</p>
          </div>)}
          <p className="mt-2 text-gray-300">Live updates ~2s while hovered/focused. Throughput is helper output, not provider download speed. Processing FPS is not browser-rendered FPS.</p>
        </> : <p className="mt-2">Update the helper using AI help for live stream telemetry.</p>}
      </>}
      <p className="mt-2">{state.checkedAt ? `Last check: ${new Date(state.checkedAt).toLocaleTimeString()}` : "Not checked yet"}{state.latency !== undefined ? ` · ${state.latency} ms` : ""}</p>
      <p>Click to open the local explanation and system-status page. If the helper is stopped, that page cannot load. Video in local modes uses this PC, not Vercel bandwidth.</p>
    </div>
  </div>;
}

"use client";

import { useId } from "react";
import { checkLocalHelper, LOCAL_HELPER_URL, useLocalHelperStatus } from "@/hooks/useLocalHelperStatus";

export default function LocalHelperStatus({ onDark = false }: { onDark?: boolean }) {
  const state = useLocalHelperStatus();
  const tooltip = useId();
  const health = state.health;
  const label = { ready: "Helper ready", checking: "Checking helper", unavailable: "Helper unreachable", attention: "Helper needs attention", outdated: "Helper update needed" }[state.status];
  const color = state.status === "ready" ? "bg-green-500" : state.status === "checking" ? "bg-gray-400" : state.status === "outdated" ? "bg-amber-500" : "bg-red-500";
  return <div className={`group relative flex items-center gap-1 text-xs ${onDark ? "text-white" : "text-gray-900 dark:text-white"}`}>
    <a href={`${LOCAL_HELPER_URL}/`} target="_blank" rel="noopener noreferrer" aria-describedby={tooltip} className="flex items-center gap-2 rounded border border-current/25 px-2 py-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500" title={`${label} — IP 127.0.0.1 · port 19876 · click for local status page`}>
      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${color}`} />{label}
    </a>
    <button type="button" onClick={() => void checkLocalHelper()} disabled={state.status === "checking"} className="rounded px-1.5 py-1.5 underline disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500" aria-label="Retry local helper detection">Retry</button>
    <div id={tooltip} role="tooltip" className="pointer-events-none absolute left-0 top-full z-[10010] hidden w-[min(23rem,85vw)] whitespace-normal rounded-lg border border-gray-600 bg-gray-950 p-3 text-left text-xs leading-relaxed text-gray-100 shadow-xl group-hover:block group-focus-within:block">
      <p className="font-semibold">{label} · HTTP 127.0.0.1:19876</p>
      <p className="mt-1">{state.detail}</p>
      {health && <>
        <p className="mt-2">Helper {health.helperVersion} · FFmpeg {health.ffmpeg.version || "unavailable"}</p>
        <p>AAC: {health.ffmpeg.aac ? "yes" : "no"} · H.264: {health.ffmpeg.h264 ? "yes" : "no"}</p>
        <p>{health.system.platform} / {health.system.arch} · Node {health.system.node}</p>
        <p>Uptime: {Math.floor(health.system.helperUptimeSeconds / 60)} min · Free RAM: {health.system.freeMemoryMB} MB</p>
        <p>Streams: {health.sessions.active} · Session slots: {health.sessions.allocated}/{health.sessions.limit}</p>
        <p>Configured provider hosts: {health.configuration.providerHosts.length}</p>
      </>}
      <p className="mt-2">{state.checkedAt ? `Last check: ${new Date(state.checkedAt).toLocaleTimeString()}` : "Not checked yet"}{state.latency !== undefined ? ` · ${state.latency} ms` : ""}</p>
      <p>Click to open the local explanation and system-status page. If the helper is stopped, that page cannot load. Video in local modes uses this PC, not Vercel bandwidth.</p>
    </div>
  </div>;
}

"use client";

import { useEffect, useSyncExternalStore } from "react";

export const LOCAL_HELPER_URL = "http://127.0.0.1:19876";
type Stream = {
  number: number; mode: string; source: string; extension: string | null; state: string;
  bytesSent: number; currentMbps: number; averageMbps?: number; peakMbps?: number;
  frames?: number | null; processingFps?: number | null; mediaSeconds?: number | null; speed?: number | null;
  elapsedSeconds?: number; droppedFrames?: number | null; duplicatedFrames?: number | null;
  input?: { container?: string; videoCodec?: string; audioCodec?: string; resolution?: string; fps?: number | null };
  output?: { videoCodec?: string; audioCodec?: string; resolution?: string; fps?: number | null };
};
type Health = {
  version: number; healthSchema: number; helperVersion: string; ready: boolean;
  problems: string[]; ffmpeg: { available: boolean; version: string | null; aac: boolean; h264: boolean };
  system: { platform: string; arch: string; node: string; helperUptimeSeconds: number; freeMemoryMB: number };
  sessions: { active: number; allocated: number; limit: number };
  configuration: { providerHosts: string[]; allowedOrigins: string[] };
  telemetrySchema?: number; streams?: Stream[]; transfer?: { bytesSent: number; streamsStarted: number };
};
type Snapshot = { status: "checking" | "ready" | "unavailable" | "attention" | "outdated"; detail: string; checkedAt?: number; latency?: number; health?: Health };
const initial: Snapshot = { status: "checking", detail: "Checking the local helper…" };
let snapshot = initial;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let pending: Promise<void> | undefined;
let liveSubscribers = 0;
function publish(next: Snapshot) { snapshot = next; listeners.forEach(listener => listener()); }
export function checkLocalHelper(showChecking = true) {
  if (pending) return pending;
  if (showChecking || !snapshot.health) publish({ ...snapshot, status: "checking", detail: "Checking the local helper…" });
  pending = (async () => {
    const start = performance.now();
    try {
      const response = await fetch(`${LOCAL_HELPER_URL}/health`, { cache: "no-store", signal: AbortSignal.timeout(8000), credentials: "omit" });
      if (!response.ok) throw new Error(`Helper returned HTTP ${response.status}. Check its allowed website origins.`);
      const health = await response.json();
      if (health.version !== 1 || health.healthSchema !== 2 || typeof health.ready !== "boolean" ||
          !Array.isArray(health.problems) || !health.ffmpeg || !health.system || !health.sessions ||
          !Array.isArray(health.configuration?.providerHosts)) {
        publish({ status: "outdated", detail: "Helper detected, but detailed readiness is unavailable. Update it using AI help.", checkedAt: Date.now() });
        return;
      }
      publish({ status: health.ready ? "ready" : "attention", detail: health.ready ? "FFmpeg, AAC/H.264 encoders, provider configuration and session capacity are ready. Provider access is not tested." : health.problems.join(" "), health, checkedAt: Date.now(), latency: Math.round(performance.now() - start) });
    } catch (error) {
      publish({ status: "unavailable", detail: error instanceof TypeError || (error instanceof DOMException && error.name === "TimeoutError")
        ? "Unreachable or permission blocked. Start the helper on this PC, allow browser local-network access, and check LOCAL_PLAYER_ORIGINS. This does not mean it is uninstalled."
        : error instanceof Error ? error.message : "Helper check failed.", checkedAt: Date.now() });
    }
  })().finally(() => { pending = undefined; });
  return pending;
}
function visibleCheck() { if (document.visibilityState === "visible") void checkLocalHelper(false); }
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    visibleCheck();
    timer = setInterval(() => {
      if (Date.now() - (snapshot.checkedAt || 0) >= (liveSubscribers ? 2000 : 15000)) visibleCheck();
    }, 1000);
    document.addEventListener("visibilitychange", visibleCheck);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { clearInterval(timer); document.removeEventListener("visibilitychange", visibleCheck); }
  };
}
export function useLocalHelperStatus(live = false) {
  useEffect(() => {
    if (!live) return;
    liveSubscribers += 1;
    visibleCheck();
    return () => { liveSubscribers -= 1; };
  }, [live]);
  return useSyncExternalStore(subscribe, () => snapshot, () => initial);
}

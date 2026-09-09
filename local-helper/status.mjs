import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { streamSnapshot } from './telemetry.mjs';

const execute = promisify(execFile);
let cache;
let pending;
export async function inspectFFmpeg(executable) {
  if (cache && Date.now() - cache.checkedAt < 30000) return cache;
  if (pending) return pending;
  pending = (async () => {
    try {
      const options = { timeout: 5000, maxBuffer: 512 * 1024, windowsHide: true };
      const [version, encoders] = await Promise.all([
        execute(executable, ['-version'], options),
        execute(executable, ['-hide_banner', '-encoders'], options),
      ]);
      const aac = /\baac\s/.test(encoders.stdout);
      const h264 = /\blibx264\s/.test(encoders.stdout);
      cache = { available: true, version: version.stdout.match(/^ffmpeg version (\S+)/)?.[1] || 'unknown', aac, h264, checkedAt: Date.now(), error: null };
    } catch {
      cache = { available: false, version: null, aac: false, h264: false, checkedAt: Date.now(), error: 'FFmpeg is missing, cannot run, or its check timed out. Check PATH or LOCAL_PLAYER_FFMPEG and restart the helper.' };
    }
    return cache;
  })();
  try { return await pending; } finally { pending = undefined; }
}

export async function healthSnapshot({ ffmpeg, port, origins, hosts, sessions, totals = { bytesSent: 0, streamsStarted: 0 } }) {
  const binary = await inspectFFmpeg(ffmpeg);
  const problems = [];
  if (!binary.available) problems.push(binary.error);
  else {
    if (!binary.aac) problems.push('FFmpeg lacks the AAC encoder required by both local modes.');
    if (!binary.h264) problems.push('FFmpeg lacks libx264 required by compatibility mode.');
  }
  if (!hosts.size) problems.push('No trusted providers configured. Set LOCAL_PLAYER_HOSTS.');
  if (sessions.size >= 2) problems.push('All two playback session slots are occupied. Close a player and retry.');
  return {
    version: 1, healthSchema: 2, telemetrySchema: 1, helperVersion: '1.2.0', ready: problems.length === 0,
    checkedAt: new Date().toISOString(), address: '127.0.0.1', port,
    statusUrl: `http://127.0.0.1:${port}/`, problems, ffmpeg: binary,
    modes: { remux: binary.available && binary.aac, compatible: binary.available && binary.aac && binary.h264 },
    system: { platform: os.platform(), release: os.release(), arch: os.arch(), node: process.version,
      logicalCpus: os.availableParallelism(), totalMemoryMB: Math.round(os.totalmem() / 1048576),
      freeMemoryMB: Math.round(os.freemem() / 1048576), helperUptimeSeconds: Math.floor(process.uptime()), helperMemoryMB: Math.round(process.memoryUsage().rss / 1048576) },
    configuration: { allowedOrigins: [...origins], providerHosts: [...hosts] },
    sessions: { active: [...sessions.values()].filter(s => s.child).length, allocated: sessions.size, limit: 2 },
    transfer: { ...totals, providerDownloadMbps: null, measurement: 'FFmpeg output bytes forwarded toward the browser; not provider download speed or acknowledged playback.' },
    streams: [...sessions.values()].map((session, index) => streamSnapshot(session, index)),
  };
}

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function statusPage(h) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script src="/status.js" defer></script><title>Local IPTV helper</title><style>
body{font:16px/1.6 system-ui;margin:32px auto;padding:0 20px;max-width:1100px;background:#f8fafc;color:#172033}h1{font-size:1.8rem}section,article{background:white;border:1px solid #cbd5e1;border-radius:12px;padding:20px;margin:16px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#1746b0}.good{color:#166534}.bad{color:#991b1b}button,select{font:inherit;border:1px solid #64748b;border-radius:6px;padding:6px 10px;background:transparent;color:inherit;cursor:pointer}button:focus-visible,select:focus-visible,a:focus-visible{outline:3px solid #3b82f6;outline-offset:2px}.controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center}dl{display:grid;grid-template-columns:minmax(130px,1fr) 2fr;gap:6px 16px}dt{font-weight:600}dd{margin:0;overflow-wrap:anywhere}svg{width:100%;height:100px;background:#64748b15}.note{font-size:.9em;opacity:.85}@media(prefers-color-scheme:dark){body{background:#101827;color:#e5edf7}section,article{background:#182336;border-color:#475569}a{color:#93c5fd}.good{color:#86efac}.bad{color:#fca5a5}select{background:#182336}}</style></head><body>
<h1>Local IPTV playback helper</h1><p id="ready" class="${h.ready ? 'good' : 'bad'}"><strong>${h.ready ? '● Ready for local playback' : '● Needs attention'}</strong> · Helper ${escape(h.helperVersion)}</p>
<div class="controls"><button id="refresh" type="button">Refresh now</button><button id="pause" type="button" aria-pressed="false">Pause updates</button><label>Update interval <select id="interval"><option value="2000">2 seconds</option><option value="5000">5 seconds</option><option value="10000">10 seconds</option></select></label><a href="/">Reload page</a></div>
<p id="update-status" role="status">Loading live statistics… Last snapshot: ${escape(h.checkedAt)}.</p><noscript><p>JavaScript is disabled. Use Reload page for fresh statistics.</p></noscript>
<section><h2>Live stream telemetry</h2><p id="transfer-summary">No live sample yet.</p><svg viewBox="0 0 600 100" role="img" aria-label="Recent output throughput"><polyline id="throughput-chart" points="0,100 600,100" fill="none" stroke="#3b82f6" stroke-width="3" /></svg><p id="chart-label" class="note">Recent aggregate output throughput (Mbps), last 60 samples. Scale adjusts to the peak.</p><div id="stream-details"><pre>${escape(JSON.stringify(h.streams, null, 2))}</pre></div><p class="note">Throughput counts FFmpeg output bytes forwarded toward the browser, not provider download speed or bytes actually watched. Current rate uses approximately the last five seconds. Processing FPS is FFmpeg progress, not browser-rendered FPS. Source/output FPS are metadata and may be unknown. Peak means highest sampled rate. Full URL paths and queries are hidden because they can contain passwords.</p></section>
<section><h2>How it works</h2><p>Your browser connects to <strong>${escape(h.statusUrl)}</strong> on this computer. The helper downloads IPTV directly and FFmpeg streams browser-friendly MPEG-TS back. No video passes through Vercel in local modes. No inbound internet connection, NAT change or port forwarding is needed.</p><p>Choose <strong>Local fast</strong> to copy video and convert audio to AAC, or <strong>Local compatibility</strong> to convert video to H.264 too. Compatibility uses more CPU. Seeking, subtitles and alternate audio are not supported yet.</p></section>
<section><h2>Readiness</h2><p id="readiness-detail">${escape(h.problems.join(' ') || 'FFmpeg, required encoders, provider configuration and session capacity checks passed.')}</p><p id="encoder-detail">FFmpeg: ${escape(h.ffmpeg.version || 'unavailable')} · AAC: ${h.ffmpeg.aac ? 'yes' : 'no'} · H.264 (libx264): ${h.ffmpeg.h264 ? 'yes' : 'no'}</p><p id="session-detail">Playback processes: ${h.sessions.active}; allocated sessions: ${h.sessions.allocated}/${h.sessions.limit}.</p><p>Ready does not verify your subscription, provider reachability, a specific stream or browser codec support.</p></section>
<section><h2>System information</h2><pre id="system-detail">${escape(JSON.stringify(h.system, null, 2))}</pre></section>
<section><h2>Connection and configuration</h2><p>IP: ${escape(h.address)} · Port: ${h.port} · Protocol: HTTP over loopback only.</p><p>Allowed website origins:</p><pre>${escape(h.configuration.allowedOrigins.join('\n') || '(none)')}</pre><p>Trusted provider hosts:</p><pre>${escape(h.configuration.providerHosts.join('\n') || '(none)')}</pre><p>No passwords, full stream URLs, session IDs, environment dumps or user/home paths are shown.</p></section>
<section><h2>Troubleshooting</h2><ul><li>If this page loads but the website indicator is red, allow local-network access in the browser and check the exact website origin in LOCAL_PLAYER_ORIGINS.</li><li>If FFmpeg is unavailable, install it or set LOCAL_PLAYER_FFMPEG; ensure AAC and libx264 encoders exist. Checks refresh every 30 seconds.</li><li>Set LOCAL_PLAYER_HOSTS to your trusted provider hosts, including non-default ports. Restart after editing local configuration.</li><li>If fast mode has no picture, try compatibility. Provider/account errors still require working provider access.</li><li>An older helper may need upgrading from the website's AI help specification.</li><li>Keep the helper running on the same computer as the browser. To stop it, use Ctrl+C in its terminal. Close playback before restarting.</li></ul></section></body></html>`;
}

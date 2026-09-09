/* Local-only dashboard. Never inject telemetry as HTML. */
const byId = id => document.getElementById(id);
const setText = (id, value) => { byId(id).textContent = value; };
const number = (value, suffix = '', digits = 2) => typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : 'unknown';
const history = [];
let pending = false;
let paused = false;
let timer;
let lastSuccess = null;

function renderStream(stream) {
  const article = document.createElement('article');
  const title = document.createElement('h3');
  title.textContent = `Stream ${stream.number} · ${stream.mode} · ${stream.state}`;
  article.append(title);
  const entries = [
    ['Source URL (redacted)', stream.source], ['Source extension / detected format', `${stream.extension || 'unknown'} / ${stream.input?.container || 'unknown'}`],
    ['Input video / audio', `${stream.input?.videoCodec || 'unknown'} / ${stream.input?.audioCodec || 'none or unknown'}`],
    ['Input resolution / frame rate', `${stream.input?.resolution || 'unknown'} / ${number(stream.input?.fps, ' fps')}`],
    ['Output video / audio / container', `${stream.output?.videoCodec || 'unknown'} / ${stream.output?.audioCodec || 'none or unknown'} / MPEG-TS`],
    ['Output resolution / frame rate', `${stream.output?.resolution || 'unknown'} / ${number(stream.output?.fps, ' fps')}`],
    ['Input / output pixel format', `${stream.input?.pixelFormat || 'unknown'} / ${stream.output?.pixelFormat || 'unknown'}`],
    ['Audio sample rate (input / output)', `${number(stream.input?.sampleRate, ' Hz', 0)} / ${number(stream.output?.sampleRate, ' Hz', 0)}`],
    ['Current / average / sampled peak output', `${number(stream.currentMbps, ' Mbps')} / ${number(stream.averageMbps, ' Mbps')} / ${number(stream.peakMbps, ' Mbps')}`],
    ['Output bytes / MiB', `${number(stream.bytesSent, ' bytes', 0)} / ${number(stream.bytesSent / 1048576, ' MiB')}`],
    ['Output media bitrate', number(stream.outputKbps, ' kbit/s')],
    ['Processed frames / processing FPS', `${number(stream.frames, '', 0)} / ${number(stream.processingFps, ' fps')}`],
    ['Conversion speed', number(stream.speed, '× realtime')],
    ['Media time / elapsed wall time', `${number(stream.mediaSeconds, ' s')} / ${number(stream.elapsedSeconds, ' s')}`],
    ['Dropped / duplicated frames (FFmpeg)', `${number(stream.droppedFrames, '', 0)} / ${number(stream.duplicatedFrames, '', 0)}`],
    ['Last output / progress update age', `${number(stream.lastOutputSecondsAgo, ' s')} / ${number(stream.progressAgeSeconds, ' s')}`],
  ];
  const list = document.createElement('dl');
  for (const [name, value] of entries) {
    const term = document.createElement('dt'); term.textContent = name;
    const definition = document.createElement('dd'); definition.textContent = value;
    list.append(term, definition);
  }
  article.append(list);
  return article;
}

async function refresh() {
  if (pending) return;
  pending = true;
  byId('refresh').disabled = true;
  const start = performance.now();
  try {
    const response = await fetch('/status', { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const h = await response.json();
    setText('ready', `${h.ready ? '● Ready for local playback' : '● Needs attention'} · Helper ${h.helperVersion}`);
    byId('ready').className = h.ready ? 'good' : 'bad';
    setText('readiness-detail', h.problems.join(' ') || 'FFmpeg, encoders, configuration and session capacity checks passed.');
    setText('encoder-detail', `FFmpeg ${h.ffmpeg.version || 'unavailable'} · AAC ${h.ffmpeg.aac ? 'yes' : 'no'} · libx264 ${h.ffmpeg.h264 ? 'yes' : 'no'}`);
    setText('session-detail', `Active processes: ${h.sessions.active} · Allocated slots: ${h.sessions.allocated}/${h.sessions.limit}`);
    setText('system-detail', JSON.stringify(h.system, null, 2));
    const streams = h.streams || [];
    const rate = streams.reduce((total, stream) => total + (stream.currentMbps || 0), 0);
    setText('transfer-summary', `Current output: ${number(rate, ' Mbps')} · Lifetime output: ${number((h.transfer?.bytesSent || 0) / 1048576, ' MiB')} · Streams started: ${h.transfer?.streamsStarted || 0}`);
    history.push(rate); if (history.length > 60) history.shift();
    const peak = Math.max(0.01, ...history);
    byId('throughput-chart').setAttribute('points', history.map((n, i) => `${i * 600 / Math.max(1, history.length - 1)},${98 - n / peak * 96}`).join(' '));
    setText('chart-label', `Last ${history.length} samples · Scale 0–${number(peak, ' Mbps')} · approximately five-second rolling output rate`);
    byId('stream-details').replaceChildren(...streams.map(renderStream));
    if (!streams.length) setText('stream-details', 'No local streams. Start Local fast or Local compatibility in the website; direct/Vercel playback does not appear here.');
    lastSuccess = new Date().toLocaleTimeString();
    setText('update-status', `${paused ? 'Paused ·' : 'Live ·'} Updated ${lastSuccess} · ${Math.round(performance.now() - start)} ms`);
  } catch {
    setText('update-status', `Refresh failed — data is stale. Last success: ${lastSuccess || 'none'}. Check that the helper is still running, then Refresh now.`);
  } finally { pending = false; byId('refresh').disabled = false; }
}
function schedule() {
  clearInterval(timer);
  if (!paused) timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, Number(byId('interval').value));
}
byId('refresh').addEventListener('click', () => void refresh());
byId('pause').addEventListener('click', () => {
  paused = !paused;
  byId('pause').textContent = paused ? 'Resume updates' : 'Pause updates';
  byId('pause').setAttribute('aria-pressed', String(paused));
  setText('update-status', `${paused ? 'Updates paused' : 'Updates resumed'} · Last success: ${lastSuccess || 'none'}`);
  schedule(); if (!paused) void refresh();
});
byId('interval').addEventListener('change', schedule);
document.addEventListener('visibilitychange', () => { if (!paused && document.visibilityState === 'visible') void refresh(); });
schedule(); void refresh();

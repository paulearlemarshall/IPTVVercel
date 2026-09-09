// Keep only numeric progress and explicitly selected codec fields. FFmpeg's
// raw diagnostics and input URLs can contain credentials and are never retained.
export function createTelemetry() {
  return { startedAt: Date.now(), bytesSent: 0, buckets: [], lastOutputAt: null,
    peakMbps: 0, frames: null, processingFps: null, mediaSeconds: null,
    speed: null, outputKbps: null, droppedFrames: null, duplicatedFrames: null,
    progressAt: null, input: {}, output: {} };
}

export function recordOutput(t, bytes, now = Date.now()) {
  t.bytesSent += bytes;
  t.lastOutputAt = now;
  const second = Math.floor(now / 1000);
  let bucket = t.buckets.at(-1);
  if (!bucket || bucket.second !== second) { bucket = { second, bytes: 0 }; t.buckets.push(bucket); }
  bucket.bytes += bytes;
  t.buckets = t.buckets.filter(b => b.second >= second - 4);
}

export function consumeDiagnostics(t, stream) {
  let buffer = '';
  let section = null;
  stream.on('data', chunk => {
    buffer += chunk.toString();
    const lines = buffer.split(/[\r\n]/);
    buffer = lines.pop().slice(-4096);
    for (const line of lines) {
      if (line.startsWith('Input #0,')) {
        section = 'input';
        t.input.container = line.match(/^Input #0, ([a-z0-9_,]+), from /i)?.[1] || null;
      } else if (line.startsWith('Output #0,')) {
        section = 'output';
        t.output.container = 'mpegts';
      }
      if (section && /Stream #0:/.test(line)) {
        const target = t[section];
        if (line.includes('Video:') && !target.videoCodec) {
          target.videoCodec = line.match(/Video: ([a-z0-9_]+)/i)?.[1] || null;
          target.resolution = line.match(/\b(\d{2,5}x\d{2,5})\b/)?.[1] || null;
          target.fps = Number(line.match(/\b([\d.]+) fps\b/)?.[1]) || null;
          target.pixelFormat = line.match(/Video:.*?, ([a-z][a-z0-9]+)(?:\(|,)/i)?.[1] || null;
        }
        if (line.includes('Audio:') && !target.audioCodec) {
          target.audioCodec = line.match(/Audio: ([a-z0-9_]+)/i)?.[1] || null;
          target.sampleRate = Number(line.match(/\b(\d+) Hz\b/)?.[1]) || null;
        }
      }
      const progress = line.match(/^(frame|fps|out_time_us|speed|bitrate|drop_frames|dup_frames|progress)=(.*)$/);
      if (!progress) continue;
      const [, key, raw] = progress;
      if (key === 'progress') { t.progressAt = Date.now(); continue; }
      const value = Number.parseFloat(raw.trim());
      if (!Number.isFinite(value) || value < 0) continue;
      const field = { frame: 'frames', fps: 'processingFps', out_time_us: 'mediaSeconds', speed: 'speed', bitrate: 'outputKbps', drop_frames: 'droppedFrames', dup_frames: 'duplicatedFrames' }[key];
      t[field] = key === 'out_time_us' ? value / 1000000 : value;
    }
  });
}

export function streamSnapshot(session, index, now = Date.now()) {
  const t = session.telemetry;
  const source = new URL(session.source);
  const base = { number: index + 1, mode: session.mode,
    source: `${source.protocol}//${source.host}/… (path and query hidden)`,
    extension: source.pathname.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase() || null,
    state: t ? 'streaming' : 'waiting', outputContainer: 'mpegts' };
  if (!t) return { ...base, bytesSent: 0, currentMbps: 0 };
  const seconds = Math.max((now - t.startedAt) / 1000, 0.001);
  const recentBytes = t.buckets.filter(b => b.second >= Math.floor(now / 1000) - 4).reduce((n, b) => n + b.bytes, 0);
  const currentMbps = recentBytes * 8 / Math.min(seconds, 5) / 1000000;
  t.peakMbps = Math.max(t.peakMbps, currentMbps);
  return { ...base, state: !t.lastOutputAt ? 'starting' : now - t.lastOutputAt > 5000 ? 'no recent output' : 'streaming',
    bytesSent: t.bytesSent, currentMbps, averageMbps: t.bytesSent * 8 / seconds / 1000000,
    peakMbps: t.peakMbps, elapsedSeconds: Math.floor(seconds),
    lastOutputSecondsAgo: t.lastOutputAt ? (now - t.lastOutputAt) / 1000 : null,
    progressAgeSeconds: t.progressAt ? (now - t.progressAt) / 1000 : null,
    frames: t.frames, processingFps: t.processingFps, mediaSeconds: t.mediaSeconds,
    speed: t.speed, outputKbps: t.outputKbps, droppedFrames: t.droppedFrames,
    duplicatedFrames: t.duplicatedFrames, input: { ...t.input }, output: { ...t.output } };
}

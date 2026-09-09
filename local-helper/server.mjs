import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { Transform } from 'node:stream';
import dotenv from 'dotenv';
import { healthSnapshot, statusPage } from './status.mjs';
import { createTelemetry, recordOutput, consumeDiagnostics } from './telemetry.mjs';

dotenv.config({ path: fileURLToPath(new URL('../.env.local', import.meta.url)), quiet: true });
dotenv.config({ path: fileURLToPath(new URL('./.env.local', import.meta.url)), quiet: true });
const port = Number(process.env.LOCAL_PLAYER_PORT || 19876);
const origins = new Set((process.env.LOCAL_PLAYER_ORIGINS || 'http://localhost:3000').split(',').map(s => s.trim()));
const hosts = new Set([
  ...Object.entries(process.env).filter(([key]) => /^XC_SERVER_\d+$/.test(key)).map(([, value]) => new URL(value).host),
  ...(process.env.LOCAL_PLAYER_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean),
]);
const sessions = new Map();
const ffmpeg = process.env.LOCAL_PLAYER_FFMPEG || 'ffmpeg';
const totals = { bytesSent: 0, streamsStarted: 0 };
const snapshot = () => healthSnapshot({ ffmpeg, port, origins, hosts, sessions, totals });
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const close = (id) => { const session = sessions.get(id); session?.child?.kill(); session?.response?.destroy(); sessions.delete(id); };

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, `http://127.0.0.1:${port}`).pathname;
  res.setHeader('cache-control', 'no-store');
  const hostAllowed = req.headers.host === `127.0.0.1:${port}`;
  const localPageRequest = hostAllowed && !req.headers.origin && req.headers['sec-fetch-site'] === 'same-origin';
  // Same-origin Fetch Metadata permits the local page's JSON refresh without
  // weakening Origin checks on playback APIs. Arbitrary cross-site reads fail.
  if (hostAllowed && req.method === 'GET' && pathname === '/status' &&
      (localPageRequest || origins.has(req.headers.origin))) {
    if (req.headers.origin) { res.setHeader('access-control-allow-origin', req.headers.origin); res.setHeader('vary', 'Origin'); }
    try { return json(res, 200, await snapshot()); } catch { return json(res, 500, { error: 'Status unavailable' }); }
  }
  if (hostAllowed && req.method === 'GET' && pathname === '/status.js' &&
      (!req.headers.origin || origins.has(req.headers.origin))) {
    res.setHeader('content-type', 'text/javascript; charset=utf-8');
    res.setHeader('x-content-type-options', 'nosniff');
    try { return res.end(await readFile(new URL('./status-client.js', import.meta.url))); }
    catch { return json(res, 500, { error: 'Status script unavailable' }); }
  }
  // A top-level navigation normally has no Origin. Only the read-only HTML
  // page permits that exception; the session API retains its origin checks.
  if (req.headers.host === `127.0.0.1:${port}` && req.method === 'GET' && pathname === '/' &&
      (!req.headers.origin || origins.has(req.headers.origin))) {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('content-security-policy', "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('x-content-type-options', 'nosniff');
    try { return res.end(statusPage(await snapshot())); }
    catch { return json(res, 500, { error: 'Status unavailable' }); }
  }
  // Loopback binding plus Host and exact Origin checks prevent other websites
  // and DNS rebinding from using this service. Session URLs are bearer secrets.
  if (req.headers.host !== `127.0.0.1:${port}` || !origins.has(req.headers.origin)) {
    return json(res, 403, { error: 'This website is not allowed by LOCAL_PLAYER_ORIGINS.' });
  }
  res.setHeader('access-control-allow-origin', req.headers.origin);
  res.setHeader('vary', 'Origin');
  res.setHeader('cache-control', 'no-store');
  if (req.method === 'OPTIONS') {
    res.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type');
    res.setHeader('access-control-allow-private-network', 'true');
    res.writeHead(204); return res.end();
  }
  try {
    if (pathname === '/health' && req.method === 'GET') return json(res, 200, await snapshot());
    if (pathname === '/sessions' && req.method === 'POST') {
      if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'JSON required' });
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 8192) return json(res, 413, { error: 'Request too large' });
      }
      let data, source;
      try { data = JSON.parse(body); source = new URL(data.url); } catch { return json(res, 400, { error: 'Invalid source' }); }
      if (!['http:', 'https:'].includes(source.protocol) || source.username || source.password || !hosts.has(source.host)) {
        return json(res, 400, { error: 'Provider must be configured in XC_SERVER_n or LOCAL_PLAYER_HOSTS on this PC.' });
      }
      if (!['remux', 'compatible'].includes(data.mode)) return json(res, 400, { error: 'Invalid mode' });
      if (sessions.size >= 2) return json(res, 429, { error: 'Close an existing local player first.' });
      const id = randomBytes(24).toString('hex');
      sessions.set(id, { source: source.href, mode: data.mode, origin: req.headers.origin, created: Date.now() });
      return json(res, 201, { id });
    }
    const id = pathname.match(/^\/sessions\/([a-f0-9]{48})(?:\/stream)?$/)?.[1];
    const session = sessions.get(id);
    if (!session || session.origin !== req.headers.origin) return json(res, 404, { error: 'Session not found' });
    if (req.method === 'DELETE') { close(id); return json(res, 200, { stopped: true }); }
    if (req.method !== 'GET' || !pathname.endsWith('/stream')) return json(res, 405, { error: 'Method not allowed' });
    if (session.child) return json(res, 409, { error: 'Session already playing' });
    const args = ['-hide_banner', '-loglevel', 'info', '-nostats', '-stats_period', '1', '-progress', 'pipe:2', '-nostdin', '-re', '-rw_timeout', '15000000',
      '-protocol_whitelist', 'http,https,tcp,tls,crypto', '-i', session.source,
      '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn',
      ...(session.mode === 'compatible' ? ['-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-pix_fmt', 'yuv420p', '-threads', '2'] : ['-c:v', 'copy']),
      '-c:a', 'aac', '-ac', '2', '-b:a', '160k', '-f', 'mpegts', '-mpegts_flags', '+resend_headers', 'pipe:1'];
    const child = spawn(ffmpeg, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    session.child = child;
    session.response = res;
    session.telemetry = createTelemetry();
    totals.streamsStarted += 1;
    consumeDiagnostics(session.telemetry, child.stderr);
    child.on('error', () => { if (!res.headersSent) json(res, 503, { error: 'FFmpeg unavailable. Install it or set LOCAL_PLAYER_FFMPEG.' }); else res.destroy(); close(id); });
    child.on('exit', code => { if (code && !res.headersSent) json(res, 502, { error: 'FFmpeg could not open or convert this stream. Try compatibility mode or check the provider.' }); else if (code) res.destroy(); });
    res.setHeader('content-type', 'video/mp2t');
    const counter = new Transform({ transform(chunk, _encoding, done) {
      recordOutput(session.telemetry, chunk.length);
      totals.bytesSent += chunk.length;
      done(null, chunk);
    } });
    child.stdout.pipe(counter).pipe(res);
    res.on('close', () => counter.destroy());
    res.on('close', () => close(id));
  } catch {
    if (!res.headersSent) json(res, 500, { error: 'Local playback request failed' }); else res.destroy();
  }
});
setInterval(() => { for (const [id, s] of sessions) if (!s.child && Date.now() - s.created > 30000) close(id); }, 10000).unref();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { for (const id of sessions.keys()) close(id); server.close(); });
server.listen(port, '127.0.0.1', () => console.log(`Local player listening on http://127.0.0.1:${port}; ${hosts.size} provider host(s) configured.`));

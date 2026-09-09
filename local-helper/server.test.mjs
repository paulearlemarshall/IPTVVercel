import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import { once } from 'node:events';

test('helper blocks untrusted requests and progressively remuxes and converts video', async () => {
  const fixture = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=15', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-f', 'mpegts', 'pipe:1'], { windowsHide: true });
  assert.equal(fixture.status, 0, 'FFmpeg must be installed for this integration test');
  const provider = http.createServer((_req, res) => { res.setHeader('content-type', 'video/mp2t'); res.end(fixture.stdout); });
  provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
  const source = `127.0.0.1:${provider.address().port}`;
  const helper = spawn(process.execPath, ['local-helper/server.mjs'], { windowsHide: true, env: { ...process.env, LOCAL_PLAYER_PORT: '19877', LOCAL_PLAYER_ORIGINS: 'http://localhost:3000', LOCAL_PLAYER_HOSTS: source }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await Promise.race([once(helper.stdout, 'data'), new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Helper startup timeout')), 5000); timer.unref(); })]);
    const base = 'http://127.0.0.1:19877';
    const headers = { origin: 'http://localhost:3000', 'content-type': 'application/json' };
    const health = await (await fetch(`${base}/health`, { headers })).json();
    assert.equal(health.healthSchema, 2);
    assert.equal(health.ready, true);
    assert.equal(health.ffmpeg.aac, true);
    assert.equal(health.ffmpeg.h264, true);
    assert.equal(health.sessions.allocated, 0);
    assert.equal(typeof health.system.freeMemoryMB, 'number');
    const statusPage = await fetch(base);
    assert.equal(statusPage.status, 200);
    assert.equal(statusPage.headers.get('x-frame-options'), 'DENY');
    assert.ok(statusPage.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
    assert.match(await statusPage.text(), /Local IPTV playback helper/);
    assert.equal((await fetch(base, { headers: { origin: 'https://evil.example' } })).status, 403);
    assert.equal((await fetch(`${base}/health`)).status, 403);
    assert.equal((await fetch(`${base}/status`)).status, 403);
    assert.equal((await fetch(`${base}/status`, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
    assert.equal((await fetch(`${base}/status`, { headers: { 'sec-fetch-site': 'same-origin' } })).status, 200);
    assert.equal((await fetch(`${base}/status`, { headers: { origin: 'https://evil.example', 'sec-fetch-site': 'same-origin' } })).status, 403);
    const script = await fetch(`${base}/status.js`);
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type'), /javascript/);
    assert.equal((await fetch(`${base}/health`, { headers: { origin: 'https://evil.example' } })).status, 403);
    assert.equal((await fetch(`${base}/sessions`, { method: 'POST', headers, body: JSON.stringify({ url: 'http://untrusted.example/movie', mode: 'remux' }) })).status, 400);
    assert.equal((await fetch(`${base}/sessions`, { method: 'POST', headers, body: JSON.stringify({ url: `file:///etc/passwd`, mode: 'remux' }) })).status, 400);
    for (const mode of ['remux', 'compatible']) {
      const created = await fetch(`${base}/sessions`, { method: 'POST', headers, body: JSON.stringify({ url: `http://${source}/fixture.ts`, mode }) });
      assert.equal(created.status, 201);
      const { id } = await created.json();
      const stream = await fetch(`${base}/sessions/${id}/stream`, { headers, signal: AbortSignal.timeout(15000) });
      assert.equal(stream.status, 200);
      const live = await (await fetch(`${base}/status`, { headers })).json();
      assert.equal(live.telemetrySchema, 1);
      assert.ok(live.transfer.bytesSent > 0);
      assert.equal(live.streams[0].input.videoCodec, 'h264');
      assert.equal(live.streams[0].input.resolution, '160x90');
      assert.equal(live.streams[0].input.fps, 15);
      assert.equal(live.streams[0].output.container, 'mpegts');
      assert.ok(live.streams[0].bytesSent > 0);
      assert.ok(!JSON.stringify(live).includes(id));
      assert.ok(!JSON.stringify(live).includes('/fixture.ts'));
      const bytes = Buffer.from(await stream.arrayBuffer());
      assert.ok(bytes.length > 188);
      const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'json', '-i', 'pipe:0'], { input: bytes, windowsHide: true });
      assert.equal(probe.status, 0);
      assert.ok(JSON.parse(probe.stdout).streams.some(s => s.codec_name === 'h264'));
      await fetch(`${base}/sessions/${id}`, { method: 'DELETE', headers });
      assert.equal((await fetch(`${base}/sessions/${id}/stream`, { headers })).status, 404);
    }
  } finally { helper.kill(); provider.close(); }
});

test('bounded diagnostic parser separates metadata and progress; output rate ages to zero', async () => {
  const { PassThrough } = await import('node:stream');
  const { createTelemetry, consumeDiagnostics, recordOutput, streamSnapshot } = await import('./telemetry.mjs');
  const telemetry = createTelemetry(); telemetry.startedAt = 1000;
  const stderr = new PassThrough(); consumeDiagnostics(telemetry, stderr);
  stderr.write("Input #0, matroska,webm, from 'http://provider.test/SECRET':\n  Stream #0:0: Video: hevc, yuv420p, 1920x1080, 24 fps\n  Stream #0:1: Audio: ac3, 48000 Hz\nOutput #0, mpegts, to 'pipe:1':\n  Stream #0:0: Video: h264, yuv420p, 1920x1080, 24 fps\nframe=48\nfps=24\nout_time_us=2000000\nspeed=1.0x\nbitrate=N/A\nprogress=continue\n");
  recordOutput(telemetry, 1000000, 2000);
  const session = { source: 'https://provider.test/SECRET/movie.mkv?password=HIDDEN', mode: 'compatible', telemetry };
  const sample = streamSnapshot(session, 0, 3000);
  assert.equal(sample.input.videoCodec, 'hevc'); assert.equal(sample.output.videoCodec, 'h264');
  assert.equal(sample.mediaSeconds, 2); assert.equal(sample.frames, 48); assert.equal(sample.processingFps, 24);
  assert.equal(sample.currentMbps, 4); assert.equal(sample.outputKbps, null);
  assert.ok(!JSON.stringify(sample).includes('SECRET')); assert.ok(!JSON.stringify(sample).includes('HIDDEN'));
  assert.equal(streamSnapshot(session, 0, 9000).currentMbps, 0);
  assert.equal(streamSnapshot(session, 0, 9000).state, 'no recent output');
});

test('missing FFmpeg is not ready; status HTML escapes dynamic values', async () => {
  const { healthSnapshot, statusPage } = await import('./status.mjs');
  const health = await healthSnapshot({ ffmpeg: 'intentionally-missing-ffmpeg-test', port: 19877, origins: new Set(['<script>alert(1)</script>']), hosts: new Set(), sessions: new Map() });
  assert.equal(health.ready, false);
  assert.equal(health.ffmpeg.available, false);
  assert.equal(health.modes.compatible, false);
  assert.equal(health.problems.length, 2);
  const html = statusPage(health);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

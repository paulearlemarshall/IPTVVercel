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
    assert.equal((await fetch(`${base}/health`)).status, 403);
    assert.equal((await fetch(`${base}/health`, { headers: { origin: 'https://evil.example' } })).status, 403);
    assert.equal((await fetch(`${base}/sessions`, { method: 'POST', headers, body: JSON.stringify({ url: 'http://untrusted.example/movie', mode: 'remux' }) })).status, 400);
    assert.equal((await fetch(`${base}/sessions`, { method: 'POST', headers, body: JSON.stringify({ url: `file:///etc/passwd`, mode: 'remux' }) })).status, 400);
    for (const mode of ['remux', 'compatible']) {
      const created = await fetch(`${base}/sessions`, { method: 'POST', headers, body: JSON.stringify({ url: `http://${source}/fixture.ts`, mode }) });
      assert.equal(created.status, 201);
      const { id } = await created.json();
      const stream = await fetch(`${base}/sessions/${id}/stream`, { headers, signal: AbortSignal.timeout(15000) });
      assert.equal(stream.status, 200);
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

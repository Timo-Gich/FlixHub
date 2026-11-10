import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { EPG_FALLBACK_URL, PLAYLIST_URL } from '../src/parsers.js';
import { app } from '../src/server.js';

let server;
let origin;
const nativeFetch = globalThis.fetch;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  globalThis.fetch = nativeFetch;
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

test('serves channels without exposing upstream stream URLs and proxies signed HLS resources', async () => {
  let manifestAttempts = 0;
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    if (url.startsWith(origin)) return nativeFetch(input, options);
    if (url === PLAYLIST_URL) {
      return new Response([
        '#EXTM3U',
        '#EXTINF:-1 tvg-id="Test.ke@Provider" group-title="News",Test News',
        'https://93.184.216.34/live.m3u8',
      ].join('\n'));
    }
    if (url === 'https://93.184.216.34/live.m3u8') {
      manifestAttempts += 1;
      if (manifestAttempts === 1) return new Response('retry', { status: 503 });
      return new Response('#EXTM3U\n#EXTINF:5,\nseg-1.ts\n', {
        headers: { 'Content-Type': 'application/vnd.apple.mpegurl' },
      });
    }
    if (url === 'https://93.184.216.34/seg-1.ts') {
      return new Response('segment data', { headers: { 'Content-Type': 'video/mp2t' } });
    }
    throw new Error(`Unexpected upstream request: ${url}`);
  };

  const channelResponse = await nativeFetch(`${origin}/api/channels`);
  assert.equal(channelResponse.status, 200);
  const { channels } = await channelResponse.json();
  assert.equal(channels[0].streamUrl, '/api/streams/Test.ke%40Provider');
  assert.equal(JSON.stringify(channels).includes('93.184.216.34'), false);

  const manifestResponse = await nativeFetch(`${origin}${channels[0].streamUrl}`);
  assert.equal(manifestResponse.status, 200);
  assert.equal(manifestAttempts, 2);
  const manifest = await manifestResponse.text();
  const resourceUrl = manifest.split('\n').at(-2);
  assert.match(resourceUrl, /^http:\/\/127\.0\.0\.1:\d+\/api\/stream-resource\?/);
  assert.equal(new URL(resourceUrl).searchParams.get('url'), 'https://93.184.216.34/seg-1.ts');

  const segmentResponse = await nativeFetch(resourceUrl);
  assert.equal(segmentResponse.status, 200);
  assert.equal(await segmentResponse.text(), 'segment data');

  const invalidToken = await nativeFetch(`${origin}/api/stream-resource?url=http%3A%2F%2F127.0.0.1`);
  assert.equal(invalidToken.status, 403);
});

test('fetches a country guide and falls back to the Lite guide', async () => {
  const now = new Date();
  const start = new Date(now.getTime() - 30 * 60 * 1000);
  const stop = new Date(now.getTime() + 30 * 60 * 1000);
  const xmlTime = (date) => `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}` +
    `${String(date.getUTCDate()).padStart(2, '0')}${String(date.getUTCHours()).padStart(2, '0')}` +
    `${String(date.getUTCMinutes()).padStart(2, '0')}00 +0000`;
  const xml = `<tv><channel id="provider-guide"><display-name>Kenya News</display-name></channel>` +
    `<programme channel="provider-guide" start="${xmlTime(start)}" stop="${xmlTime(stop)}">` +
    '<title>Current programme</title></programme></tv>';
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    if (url.startsWith(origin)) return nativeFetch(input, options);
    if (url === 'https://epg.pw/xmltv/epg_ZZ.xml') return new Response(null, { status: 404 });
    if (url === EPG_FALLBACK_URL) return new Response(xml);
    throw new Error(`Unexpected upstream request: ${url}`);
  };

  const response = await nativeFetch(`${origin}/api/epg`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      country: 'ZZ',
      channels: [{ tvgId: 'KenyaNews.ke@Provider', name: 'Kenya News' }],
      from: now.getTime() - 60 * 60 * 1000,
      to: now.getTime() + 60 * 60 * 1000,
    }),
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.programmes['KenyaNews.ke@Provider'][0].title, 'Current programme');
});

test('validates guide requests before making upstream calls', async () => {
  globalThis.fetch = async () => {
    throw new Error('Invalid requests must not fetch upstream data');
  };
  const response = await nativeFetch(`${origin}/api/epg`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ country: 'invalid', channels: [], from: 0, to: 1 }),
  });
  assert.equal(response.status, 400);
});

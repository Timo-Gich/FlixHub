import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePlaylist, parsePlaylistStream } from '../src/parsers.js';

test('parses playlist metadata without losing quoted commas', () => {
  const channels = parsePlaylist([
    '#EXTM3U',
    '#EXTINF:-1 tvg-id="Example.ke@Provider" tvg-logo="https://img.test/logo.png" group-title="News, Local",Kenya News',
    '#EXTVLCOPT:http-user-agent=Test',
    'https://stream.test/live.m3u8',
  ].join('\n'));

  assert.equal(channels.length, 1);
  assert.equal(channels[0].name, 'Kenya News');
  assert.equal(channels[0].category, 'News, Local');
  assert.equal(channels[0].country, 'ke');
  assert.equal(channels[0].streamUrl, 'https://stream.test/live.m3u8');
});

test('streams playlist lines without losing metadata across chunk boundaries', async () => {
  const playlist = [
    '#EXTM3U',
    '#EXTINF:-1 tvg-id="Example.ke@Provider" group-title="News, Local",Kenya 🌤 News',
    '#EXTVLCOPT:http-user-agent=Test',
    'https://stream.test/live.m3u8',
  ].join('\r\n');
  const bytes = new TextEncoder().encode(playlist);
  const body = new ReadableStream({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += 5) {
        controller.enqueue(bytes.slice(offset, offset + 5));
      }
      controller.close();
    },
  });
  const channels = await parsePlaylistStream(body);

  assert.equal(channels.length, 1);
  assert.equal(channels[0].name, 'Kenya 🌤 News');
  assert.equal(channels[0].category, 'News, Local');
  assert.equal(channels[0].country, 'ke');
  assert.equal(channels[0].streamUrl, 'https://stream.test/live.m3u8');
});

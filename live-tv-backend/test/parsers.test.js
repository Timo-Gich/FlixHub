import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePlaylist, parseXmltv, parseXmltvTime } from '../src/parsers.js';

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

test('matches requested channels and returns only programmes in the requested window', () => {
  const xml = `<?xml version="1.0"?><tv>
    <channel id="epg-1"><display-name>Kenya News</display-name></channel>
    <programme channel="epg-1" start="20261110190000 +0000" stop="20261110200000 +0000">
      <title>Evening News &amp; Weather</title>
    </programme>
    <programme channel="epg-1" start="20261110210000 +0000" stop="20261110220000 +0000">
      <title>Outside Window</title>
    </programme>
    <programme channel="unrequested" start="20261110190000 +0000" stop="20261110200000 +0000">
      <title>Other channel</title>
    </programme>
  </tv>`;
  const start = Date.UTC(2026, 10, 10, 18);
  const result = parseXmltv(xml, [{ tvgId: 'KenyaNews.ke@Provider', name: 'Kenya News' }], start, start + 2 * 3600000);

  assert.deepEqual(result, {
    'KenyaNews.ke@Provider': [{
      startMs: Date.UTC(2026, 10, 10, 19),
      stopMs: Date.UTC(2026, 10, 10, 20),
      title: 'Evening News & Weather',
    }],
  });
});

test('parses XMLTV timestamps with and without timezone offsets', () => {
  assert.equal(parseXmltvTime('20261110190000 +0300'), Date.UTC(2026, 10, 10, 16));
  assert.equal(parseXmltvTime('20261110190000'), Date.UTC(2026, 10, 10, 19));
});

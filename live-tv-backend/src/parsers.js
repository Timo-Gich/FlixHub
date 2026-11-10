import { XMLParser, XMLValidator } from 'fast-xml-parser';

export const PLAYLIST_URL = 'https://iptv-org.github.io/iptv/index.category.m3u';
export const EPG_BASE_URL = 'https://epg.pw/xmltv';
export const EPG_FALLBACK_URL = `${EPG_BASE_URL}/epg_lite.xml`;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'programme' || name === 'channel',
  parseTagValue: false,
  trimValues: true,
});

function countryFromTvgId(tvgId = '') {
  const at = tvgId.lastIndexOf('@');
  const dot = tvgId.lastIndexOf('.', at === -1 ? tvgId.length : at);
  if (dot === -1 || dot >= tvgId.length - 1) return '';
  return tvgId.slice(dot + 1, at === -1 ? tvgId.length : at).toLowerCase();
}

function parseAttributes(value) {
  const attributes = {};
  const expression = /([^\s=]+)="([^"]*)"/g;
  for (const match of value.matchAll(expression)) attributes[match[1]] = match[2];
  return attributes;
}

export function parsePlaylist(text) {
  const lines = String(text).split(/\r?\n/);
  const channels = [];
  const seenIds = new Set();
  const seenChannels = new Set();

  for (let i = 0; i < lines.length; i += 1) {
    const extinf = lines[i].trim();
    if (!extinf.startsWith('#EXTINF:')) continue;
    const content = extinf.slice(8);
    let quoted = false;
    let comma = -1;
    for (let j = 0; j < content.length; j += 1) {
      if (content[j] === '"') quoted = !quoted;
      else if (content[j] === ',' && !quoted) {
        comma = j;
        break;
      }
    }
    if (comma === -1) continue;

    const attributes = parseAttributes(content.slice(0, comma));
    const name = content.slice(comma + 1).trim();
    if (!name) continue;

    let streamUrl = '';
    for (let j = i + 1; j < lines.length; j += 1) {
      const candidate = lines[j].trim();
      if (!candidate || candidate.startsWith('#')) continue;
      streamUrl = candidate;
      break;
    }
    if (!streamUrl) continue;

    const tvgId = attributes['tvg-id'] || '';
    const baseId = tvgId.trim() || `${name}-${i}`;
    let id = baseId;
    let suffix = 2;
    while (seenIds.has(id)) id = `${baseId}-${suffix++}`;
    const category = attributes['group-title'] || 'General';
    const duplicateKey = `${tvgId}\n${name}\n${category}\n${streamUrl}`;
    if (seenChannels.has(duplicateKey)) continue;
    seenIds.add(id);
    seenChannels.add(duplicateKey);

    channels.push({
      id,
      name,
      logo: attributes['tvg-logo'] || '',
      category,
      country: countryFromTvgId(tvgId),
      tvgId,
      streamUrl,
      userAgent: attributes['http-user-agent'] || '',
    });
  }
  return channels;
}

function normalize(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function xmlText(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (value && typeof value === 'object') return xmlText(value['#text'] || '');
  return '';
}

export function parseXmltvTime(value) {
  const match = String(value || '').match(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-])?(\d{2})?(\d{2})?/,
  );
  if (!match) return NaN;
  const [, year, month, day, hour, minute, seconds = '0', sign, offsetHour = '0', offsetMinute = '0'] = match;
  const date = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(seconds),
  );
  const offset = (Number(offsetHour) * 60 + Number(offsetMinute)) * 60000;
  return date - (sign === '-' ? -offset : offset);
}

export function indexXmltv(xml, fromMs, toMs) {
  if (!XMLValidator.validate(xml)) throw new Error('Invalid XMLTV response');
  const root = xmlParser.parse(xml)?.tv;
  if (!root) throw new Error('XMLTV response has no tv root');

  const displayNames = new Map();
  for (const xmlChannel of root.channel || []) {
    const xmlId = xmlChannel['@_id'] || '';
    const names = Array.isArray(xmlChannel['display-name'])
      ? xmlChannel['display-name']
      : [xmlChannel['display-name']];
    if (xmlId) displayNames.set(xmlId, names.map(xmlText).filter(Boolean));
  }

  const programmes = new Map();
  for (const item of root.programme || []) {
    const sourceId = item['@_channel'] || '';
    const startMs = parseXmltvTime(item['@_start']);
    const stopMs = parseXmltvTime(item['@_stop']);
    if (!Number.isFinite(startMs) || !Number.isFinite(stopMs) || stopMs <= fromMs || startMs >= toMs) continue;
    const title = xmlText(item.title) || 'No program info';
    if (!programmes.has(sourceId)) programmes.set(sourceId, []);
    programmes.get(sourceId).push({ startMs, stopMs, title });
  }
  for (const entries of programmes.values()) entries.sort((a, b) => a.startMs - b.startMs);
  return { displayNames, programmes, fromMs, toMs };
}

export function matchXmltv(index, requestedChannels, fromMs, toMs) {
  const aliases = new Map();
  for (const channel of requestedChannels) {
    const baseId = String(channel.tvgId || '').split('@')[0];
    for (const alias of [channel.tvgId, baseId, channel.name]) {
      const key = normalize(alias);
      if (key && !aliases.has(key)) aliases.set(key, channel.tvgId || channel.name);
    }
  }

  const map = {};
  for (const [sourceId, programmes] of index.programmes) {
    const targetId = aliases.get(normalize(sourceId)) ||
      (index.displayNames.get(sourceId) || [])
        .map(normalize)
        .map((name) => aliases.get(name))
        .find(Boolean);
    if (!targetId) continue;
    const entries = programmes.filter((item) => item.stopMs > fromMs && item.startMs < toMs);
    if (entries.length) (map[targetId] ||= []).push(...entries);
  }
  for (const entries of Object.values(map)) entries.sort((a, b) => a.startMs - b.startMs);
  return map;
}

export function parseXmltv(xml, requestedChannels, fromMs, toMs) {
  return matchXmltv(indexXmltv(xml, fromMs, toMs), requestedChannels, fromMs, toMs);
}

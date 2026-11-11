import { createHash } from 'node:crypto';
import sax from 'sax';

export const PLAYLIST_URL = 'https://iptv-org.github.io/iptv/index.category.m3u';
export const EPG_BASE_URL = 'https://epg.pw/xmltv';
export const EPG_FALLBACK_URL = `${EPG_BASE_URL}/epg_lite.xml`;

const MAX_XMLTV_CHANNELS = 100_000;
const MAX_XMLTV_PROGRAMMES = 200_000;
const MAX_XMLTV_TEXT_LENGTH = 1024;

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

    let streamUrl = '';
    for (let j = i + 1; j < lines.length; j += 1) {
      const candidate = lines[j].trim();
      if (!candidate || candidate.startsWith('#')) continue;
      streamUrl = candidate;
      break;
    }
    if (streamUrl) addPlaylistChannel(content, streamUrl, i, channels, seenIds, seenChannels);
  }
  return channels;
}

function findPlaylistComma(content) {
  let quoted = false;
  for (let i = 0; i < content.length; i += 1) {
    if (content[i] === '"') quoted = !quoted;
    else if (content[i] === ',' && !quoted) return i;
  }
  return -1;
}

function addPlaylistChannel(content, streamUrl, lineNumber, channels, seenIds, seenChannels) {
  const comma = findPlaylistComma(content);
  if (comma === -1) return;
  const attributes = parseAttributes(content.slice(0, comma));
  const name = content.slice(comma + 1).trim();
  if (!name) return;

  const tvgId = attributes['tvg-id'] || '';
  const baseId = tvgId.trim() || `${name}-${lineNumber}`;
  let id = baseId;
  let suffix = 2;
  while (seenIds.has(id)) id = `${baseId}-${suffix++}`;
  const category = attributes['group-title'] || 'General';
  const duplicateKey = createHash('sha256')
    .update(tvgId).update('\0')
    .update(name).update('\0')
    .update(category).update('\0')
    .update(streamUrl)
    .digest('hex');
  if (seenChannels.has(duplicateKey)) return;
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

export async function parsePlaylistStream(body, maxBytes = 80 * 1024 * 1024) {
  if (!body) throw new Error('Playlist response has no body');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const channels = [];
  const seenIds = new Set();
  const seenChannels = new Set();
  let lineBuffer = '';
  let pendingExtinf = null;
  let lineNumber = 0;
  let totalBytes = 0;

  const consumeLine = (line) => {
    const trimmed = line.trim();
    if (pendingExtinf) {
      if (trimmed.startsWith('#EXTINF:')) {
        pendingExtinf = { content: trimmed.slice(8), lineNumber };
      } else if (trimmed && !trimmed.startsWith('#')) {
        addPlaylistChannel(
          pendingExtinf.content,
            trimmed,
            pendingExtinf.lineNumber,
            channels,
            seenIds,
            seenChannels,
        );
        pendingExtinf = null;
      }
    } else if (trimmed.startsWith('#EXTINF:')) {
      pendingExtinf = { content: trimmed.slice(8), lineNumber };
    }
    lineNumber += 1;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) throw new Error('Playlist response exceeded size limit');
      lineBuffer += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = lineBuffer.indexOf('\n')) !== -1) {
        consumeLine(lineBuffer.slice(0, newline).replace(/\r$/, ''));
        lineBuffer = lineBuffer.slice(newline + 1);
      }
      if (lineBuffer.length > 1024 * 1024) throw new Error('Playlist line exceeded size limit');
    }
    lineBuffer += decoder.decode();
    if (lineBuffer) consumeLine(lineBuffer.replace(/\r$/, ''));
    return channels;
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function normalize(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
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

function createXmltvIndexer(fromMs, toMs) {
  const displayNames = new Map();
  const programmes = new Map();
  let rootSeen = false;
  let currentChannel = null;
  let currentProgramme = null;
  let textTarget = '';
  let textValue = '';
  let programmeCount = 0;
  let truncated = false;
  let parseError = null;
  const parser = sax.parser(true, { trim: false, normalize: false });

  parser.onerror = (error) => {
    parseError = error;
  };
  parser.onopentag = (tag) => {
    if (tag.name === 'tv') rootSeen = true;
    if (tag.name === 'channel') {
      currentChannel = { id: tag.attributes.id || '', names: [] };
    } else if (tag.name === 'programme') {
      currentProgramme = {
        sourceId: tag.attributes.channel || '',
        startMs: parseXmltvTime(tag.attributes.start),
        stopMs: parseXmltvTime(tag.attributes.stop),
        title: '',
      };
    } else if (tag.name === 'display-name' && currentChannel) {
      textTarget = 'display-name';
      textValue = '';
    } else if (tag.name === 'title' && currentProgramme && !currentProgramme.title) {
      textTarget = 'title';
      textValue = '';
    }
  };
  const appendText = (value) => {
    if (textTarget && textValue.length < MAX_XMLTV_TEXT_LENGTH) {
      textValue += value.slice(0, MAX_XMLTV_TEXT_LENGTH - textValue.length);
    }
  };
  parser.ontext = appendText;
  parser.oncdata = appendText;
  parser.onclosetag = (name) => {
    if (name === 'display-name' && textTarget === 'display-name' && currentChannel) {
      const nameText = textValue.trim();
      if (nameText) currentChannel.names.push(nameText);
      textTarget = '';
      textValue = '';
    } else if (name === 'title' && textTarget === 'title' && currentProgramme) {
      currentProgramme.title = textValue.trim();
      textTarget = '';
      textValue = '';
    } else if (name === 'channel' && currentChannel) {
      if (currentChannel.id) {
        if (displayNames.size < MAX_XMLTV_CHANNELS || displayNames.has(currentChannel.id)) {
          displayNames.set(currentChannel.id, currentChannel.names);
        } else {
          truncated = true;
        }
      }
      currentChannel = null;
    } else if (name === 'programme' && currentProgramme) {
      const { sourceId, startMs, stopMs, title } = currentProgramme;
      if (Number.isFinite(startMs) && Number.isFinite(stopMs) &&
          stopMs > fromMs && startMs < toMs) {
        if (programmeCount < MAX_XMLTV_PROGRAMMES) {
          if (!programmes.has(sourceId)) programmes.set(sourceId, []);
          programmes.get(sourceId).push({
            startMs,
            stopMs,
            title: title || 'No program info',
          });
          programmeCount += 1;
        } else {
          truncated = true;
        }
      }
      currentProgramme = null;
    }
  };

  return {
    write(chunk) {
      if (parseError) throw parseError;
      parser.write(chunk);
      if (parseError) throw parseError;
    },
    finish() {
      if (parseError) throw parseError;
      parser.close();
      if (parseError) throw parseError;
      if (!rootSeen) throw new Error('XMLTV response has no tv root');
      for (const entries of programmes.values()) entries.sort((a, b) => a.startMs - b.startMs);
      return { displayNames, programmes, fromMs, toMs, truncated };
    },
  };
}

export function indexXmltv(xml, fromMs, toMs) {
  const indexer = createXmltvIndexer(fromMs, toMs);
  indexer.write(String(xml));
  return indexer.finish();
}

export async function indexXmltvStream(body, fromMs, toMs, maxBytes = 100 * 1024 * 1024) {
  if (!body) throw new Error('XMLTV response has no body');
  const indexer = createXmltvIndexer(fromMs, toMs);
  const decoder = new TextDecoder();
  let totalBytes = 0;
  for await (const chunk of body) {
    totalBytes += chunk.byteLength;
    if (totalBytes > maxBytes) throw new Error('XMLTV response exceeded size limit');
    indexer.write(decoder.decode(chunk, { stream: true }));
  }
  indexer.write(decoder.decode());
  return indexer.finish();
}

export function matchXmltv(index, requestedChannels, fromMs, toMs) {
  const aliases = new Map();
  const displayAliases = [];
  for (const channel of requestedChannels) {
    const baseId = String(channel.tvgId || '').split('@')[0];
    for (const alias of [channel.tvgId, baseId, channel.name]) {
      const key = normalize(alias);
      if (key && !aliases.has(key)) aliases.set(key, channel.tvgId || channel.name);
    }
    const name = normalize(channel.name);
    if (name.length >= 5) displayAliases.push([name, channel.tvgId || channel.name]);
  }

  const matchDisplayName = (value) => {
    const key = normalize(value);
    const exact = aliases.get(key);
    if (exact) return exact;
    if (key.length < 5) return undefined;
    return displayAliases.find(([name]) =>
      key.startsWith(name) || name.startsWith(key),
    )?.[1];
  };

  const map = {};
  for (const [sourceId, programmes] of index.programmes) {
    const targetId = aliases.get(normalize(sourceId)) ||
      (index.displayNames.get(sourceId) || [])
        .map(matchDisplayName)
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

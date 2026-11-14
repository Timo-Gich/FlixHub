import { createHash } from 'node:crypto';

export const PLAYLIST_URL = 'https://iptv-org.github.io/iptv/index.category.m3u';

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

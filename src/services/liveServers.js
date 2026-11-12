import { buildStreamUrl } from './liveTvService';

export const LIVE_SERVERS = [
  {
    id: 'default',
    label: 'Default',
    provider: 'IPTV',
    type: 'hls',
    urlBuilder: (_id, channel) => buildStreamUrl(channel),
  },
  {
    id: 'alt',
    label: 'Alt Source',
    provider: 'Iframe',
    type: 'iframe',
    urlBuilder: (id) => 'about:blank',
  },
];

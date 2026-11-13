const DADDY_BASE_URL = 'https://thedaddy.li';


export const LIVE_SERVERS = [
  {
    id: 'daddylive-server1',
    label: 'Server 1',
    provider: 'DaddyLive',
    type: 'iframe',
    urlBuilder: (id) => `${DADDY_BASE_URL}/stream/stream-${id}.php`,
  },
  {
    id: 'daddylive-server2',
    label: 'Server 2',
    provider: 'DaddyLive',
    type: 'iframe',
    urlBuilder: (id) => `${DADDY_BASE_URL}/cast/stream-${id}.php`,
  },
  {
    id: 'daddylive-server3',
    label: 'Server 3',
    provider: 'DaddyLive',
    type: 'iframe',
    urlBuilder: (id) => `${DADDY_BASE_URL}/watch/stream-${id}.php`,
  },
  {
    id: 'daddylive-server4',
    label: 'Server 4',
    provider: 'DaddyLive',
    type: 'iframe',
    urlBuilder: (id) => `${DADDY_BASE_URL}/plus/stream-${id}.php`,
  },
  {
    id: 'daddylive-server5',
    label: 'Server 5',
    provider: 'DaddyLive',
    type: 'iframe',
    urlBuilder: (id) => `${DADDY_BASE_URL}/casting/stream-${id}.php`,
  },
  {
    id: 'daddylive-server6',
    label: 'Server 6',
    provider: 'DaddyLive',
    type: 'iframe',
    urlBuilder: (id) => `${DADDY_BASE_URL}/player/stream-${id}.php`,
  },
  {
    id: 'iptv',
    label: 'Server 7 (IPTV)',
    provider: 'IPTV (HLS)',
    type: 'hls',
    urlBuilder: (id) => `https://iptv.example.com/stream/${id}.m3u8`,
  },
];

export const DADDYLIVE_SERVERS = LIVE_SERVERS.filter((server) => server.provider === 'DaddyLive');

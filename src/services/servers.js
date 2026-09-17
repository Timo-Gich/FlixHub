// ----------------------------------------------------------------------------
// Embed provider (server) configuration.
//
// Each server exposes a movie(id, imdbId) and tv(id, imdbId, season, episode)
// URL builder. Server 1 (2Embed), Server 2 (VidSrc) and Server 3 (VidCore)
// all use the TMDb id directly.
// ----------------------------------------------------------------------------

export const SERVERS = [
  {
    id: 'server1',
    label: 'Server 1',
    provider: '2Embed',
    // Uses the TMDb id directly.
    usesImdb: false,
    movie: (id) => `https://www.2embed.cc/embed/movie/${id}`,
    tv: (id, _imdbId, season, episode) =>
      `https://www.2embed.cc/embed/tv/${id}/${season}/${episode}`,
  },
  {
    id: 'server2',
    label: 'Server 2',
    provider: 'VidSrc',
    // VidSrc accepts both IMDb and TMDb ids; we use the TMDb id directly.
    usesImdb: false,
    movie: (id) => `https://vidsrc.tw/embed/movie/${id}`,
    tv: (id, _imdbId, season, episode) =>
      `https://vidsrc.tw/embed/tv/${id}/${season}/${episode}`,
  },
  {
    id: 'server3',
    label: 'Server 3',
    provider: 'VidCore',
    // Accepts IMDb or TMDb ids; we reuse the TMDb id.
    usesImdb: false,
    movie: (id) => `https://vidcore.io/movie/${id}?autoPlay=true`,
    tv: (id, _imdbId, season, episode) =>
      `https://vidcore.io/tv/${id}/${season}/${episode}?autoPlay=true`,
  },
];

/** Look up a server by id, falling back to the first (Server 1 / VidKing). */
export function getServer(id) {
  return SERVERS.find((s) => s.id === id) ?? SERVERS[0];
}
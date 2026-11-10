// ----------------------------------------------------------------------------
// Embed provider (server) configuration.
//
// Each server exposes a movie(id, imdbId) and tv(id, imdbId, season, episode)
// URL builder. Server 1 (VidSrc), Server 2 (VidCore), Server 3 (2Embed),
// Server 4 (VidFast), Server 5 (VidRock) and Server 6 (PrimeSrc) all use the
// TMDb id directly.
// ----------------------------------------------------------------------------

export const SERVERS = [
  {
    id: 'server1',
    label: 'Server 1',
    provider: 'VidSrc',
    // VidSrc accepts both IMDb and TMDb ids; we use the TMDb id directly.
    usesImdb: false,
    movie: (id) => `https://vidsrc.sh/embed/movie/${id}`,
    tv: (id, _imdbId, season, episode) =>
      `https://vidsrc.sh/embed/tv/${id}/${season}/${episode}`,
  },
  {
    id: 'server2',
    label: 'Server 2',
    provider: 'VidCore',
    // Accepts IMDb or TMDb ids; we reuse the TMDb id.
    usesImdb: false,
    movie: (id) => `https://vidcore.io/movie/${id}?autoPlay=true`,
    tv: (id, _imdbId, season, episode) =>
      `https://vidcore.io/tv/${id}/${season}/${episode}?autoPlay=true`,
  },
  {
    id: 'server3',
    label: 'Server 3',
    provider: '2Embed',
    // Uses the TMDb id directly.
    usesImdb: false,
    movie: (id) => `https://www.2embed.cc/embed/movie/${id}`,
    tv: (id, _imdbId, season, episode) =>
      `https://www.2embed.cc/embed/tv/${id}/${season}/${episode}`,
  },
  {
    id: 'server4',
    label: 'Server 4',
    provider: 'VidFast',
    // Accepts the TMDb id directly.
    usesImdb: false,
    movie: (id) => `https://vidfast.vc/movie/${id}`,
    tv: (id, _imdbId, season, episode) =>
      `https://vidfast.vc/tv/${id}/${season}/${episode}`,
  },
  {
    id: 'server5',
    label: 'Server 5',
    provider: 'VidRock',
    // Accepts the TMDb id directly.
    usesImdb: false,
    movie: (id) => `https://vidrock.net/movie/${id}`,
    tv: (id, _imdbId, season, episode) =>
      `https://vidrock.net/tv/${id}/${season}/${episode}`,
  },
  {
    id: 'server6',
    label: 'Server 6',
    provider: 'PrimeSrc',
    // Accepts the TMDb id directly.
    usesImdb: false,
    movie: (id) => `https://primesrc.me/embed/movie?tmdb=${id}`,
    tv: (id, _imdbId, season, episode) =>
      `https://primesrc.me/embed/tv?tmdb=${id}&season=${season}&episode=${episode}`,
  },
];

/** Look up a server by id, falling back to the first (Server 1 / VidSrc). */
export function getServer(id) {
  return SERVERS.find((s) => s.id === id) ?? SERVERS[0];
}
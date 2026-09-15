// ----------------------------------------------------------------------------
// Embed provider (server) configuration.
//
// Each server exposes a movie(id, imdbId) and tv(id, imdbId, season, episode)
// URL builder. Server 1 (VidKing) and Server 3 (VidCore) use the TMDb id
// directly; Server 2 (VidSrc) requires a TMDb IMDb id (format "tt..."), which is
// resolved via the /external_ids endpoint and cached by the UI.
// ----------------------------------------------------------------------------

export const SERVERS = [
  {
    id: 'server1',
    label: 'Server 1',
    provider: 'VidKing',
    // Uses the TMDb id directly.
    usesImdb: false,
    movie: (id) => `https://www.vidking.net/embed/movie/${id}`,
    tv: (id, _imdbId, season, episode) =>
      `https://www.vidking.net/embed/tv/${id}/${season}/${episode}`,
  },
  {
    id: 'server2',
    label: 'Server 2',
    provider: 'VidSrc',
    // Strictly requires a TMDb IMDb id (format "tt1234567").
    usesImdb: true,
    movie: (_id, imdbId) => `https://vidsrc.cc/v2/embed/movie/${imdbId}`,
    tv: (_id, imdbId, season, episode) =>
      `https://vidsrc.cc/v2/embed/tv/${imdbId}/${season}/${episode}`,
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
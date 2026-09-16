import { Link, useLocation, useParams } from 'react-router-dom';
import VideoPlayer from '../components/VideoPlayer';
import { getImdbLookup } from '../services/imdbService';

// IMDb-only watch route: only VidSrc works here, because VidKing and VidCore
// require a numeric TMDb id. VidSrc accepts an IMDb id ("tt…").
const IMDB_VIDSRC = [
  {
    id: 'server2',
    label: 'Server 2',
    provider: 'VidSrc',
    usesImdb: false,
    movie: (id) => `https://vidsrc.tw/embed/movie/${id}`,
    tv: (id, _imdbId, season, episode) =>
      `https://vidsrc.tw/embed/tv/${id}/${season}/${episode}`,
  },
];

/**
 * /watch/imdb/:imdbId — plays an IMDb-only title through VidSrc. TV defaults
 * to Season 1, Episode 1 (no season data is available for non-TMDb titles).
 */
export default function ImdbWatchPage() {
  const { imdbId } = useParams();
  const { state } = useLocation();

  // Prefer navigation state; fall back to the cached IMDb lookup (survives refresh).
  const found = imdbId ? getImdbLookup()[imdbId] : null;
  const type = state?.type === 'tv' || found?.type === 'tv' ? 'tv' : 'movie';
  const title = state?.title || found?.title || 'Title';
  const season = type === 'tv' ? 1 : undefined;
  const episode = type === 'tv' ? 1 : undefined;
  const hasValidId = imdbId !== undefined && imdbId !== null && imdbId !== '';

  const nowLabel = hasValidId ? `Now playing - ${title}` : 'Player';
  const backHref = hasValidId ? `/imdb/${imdbId}` : '/';
  const iframeTitle = hasValidId ? `${title} player` : 'Player';
  const notice = (
    <p>
      This player may contain advertisements. For a clean, uninterrupted
      experience, consider using an ad-blocker while streaming.
    </p>
  );

  // Link shown when the id is missing/invalid.
  if (!hasValidId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink px-6 text-foreground">
        <div className="max-w-xl text-center">
          <h1 className="text-2xl font-black text-white">Player unavailable</h1>
          <p className="mt-3 text-sm text-muted">
            The IMDb id is missing or invalid.
          </p>
          <Link
            to="/"
            className="mt-5 inline-block rounded-md bg-brand px-6 py-2.5 text-sm font-bold
                       text-white transition hover:bg-brand-dark"
          >
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <VideoPlayer
      type={type}
      id={imdbId}
      season={season}
      episode={episode}
      servers={IMDB_VIDSRC}
      rawId
      nowLabel={nowLabel}
      backHref={backHref}
      iframeTitle={iframeTitle}
      notice={notice}
    />
  );
}
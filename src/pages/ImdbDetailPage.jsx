import { Link, useLocation, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { getImdbLookup } from '../services/imdbService';

/**
 * /imdb/:imdbId — lightweight detail page for titles found only via IMDb.
 * IMDb's suggestion API only provides title, year, poster and type, so no
 * cast / recommendations / similar are shown. The Play button opens the
 * IMDb-only watch route (VidSrc).
 */
export default function ImdbDetailPage() {
  const { imdbId } = useParams();
  const { state } = useLocation();

  // The item comes via route state (info from the search card) or, after a
  // refresh, from the localStorage lookup kept by the IMDb search service.
  const lookup = getImdbLookup();
  const item = state?.imdb ?? (imdbId ? lookup[imdbId] : null);

  const title = item?.title || state?.title || 'Title';
  const year = item?.year || state?.year || null;
  const poster = item?.poster || state?.poster || null;
  const type = item?.type || state?.type || 'movie';
  const isTv = type === 'tv';

  return (
    <div className="min-h-screen bg-ink text-foreground">
      <Navbar />

      <main className="mx-auto w-full max-w-[1200px] px-4 pb-20 pt-28 sm:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-10">
          {poster ? (
            <img
              src={poster}
              alt={`${title} poster`}
              className="w-56 shrink-0 rounded-lg object-cover shadow-2xl ring-1 ring-white/10 sm:w-64"
            />
          ) : (
            <div
              className="flex w-56 shrink-0 items-center justify-center rounded-lg bg-ink-raised
                         ring-1 ring-white/10 sm:h-80 sm:w-64"
              aria-hidden="true"
            >
              <span className="text-5xl font-black text-white/20">
                {title[0]?.toUpperCase() || '?'}
              </span>
            </div>
          )}

          <div className="max-w-xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">
              {isTv ? 'TV Series' : 'Movie'}
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">
              {title}
            </h1>
            {year && <p className="mt-1 text-sm text-muted">{year}</p>}

            <p className="mt-2 text-xs text-muted">
              Limited details available for this title.
            </p>

            {imdbId && (
              <Link
                to={`/watch/imdb/${imdbId}`}
                state={{ imdbId, type, title, year, poster }}
                className="mt-6 inline-flex items-center gap-2 rounded-md bg-brand px-8 py-3
                           text-base font-bold text-white shadow-md shadow-brand/40 transition
                           hover:bg-brand-dark focus:outline-none
                           focus-visible:ring-2 focus-visible:ring-white/70 active:scale-[0.98]"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Play
              </Link>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
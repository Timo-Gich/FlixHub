import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getPosterUrl,
  getBackdropUrl,
  getImageUrl,
  getLogoUrl,
  fetchMediaImages,
  formatRating,
  formatYear,
} from '../services/tmdbService';
import { useLibrary } from '../hooks/useLibrary.jsx';
import { gradients } from '../data/movies';
import CollectionPicker from './CollectionPicker';

let lastPageScrollAt = 0;

/**
 * A single movie tile fed from TMDb data.
 * Renders the real poster when available, otherwise a gradient placeholder.
 * Hovering reveals the overview and a play affordance. The whole card links to
 * the watch page for that movie.
 * Props:
 *   - movie        : a TMDb movie object (title, poster_path, vote_average, …)
 *   - index        : optional numeric rank shown in the corner
 *   - saved        : optional controlled saved-state. When provided, the
 *                    bookmark button calls onToggleSaved instead of writing to
 *                    localStorage directly.
 *   - onToggleSaved: (movie) => void
 *   - onRemove     : (movie) => void — when provided, shows a ✕ remove button
 *   - progress     : optional number 0..1 for a "Continue Watching" progress bar
 *   - to           : optional link override (e.g. a TV watch URL)
 *   - meta         : optional short label shown near the year (e.g. "S1 E2")
 */
export default function MovieCard({
  movie,
  index,
  saved,
  onToggleSaved,
  onRemove,
  progress,
  to,
  meta,
  onMoveToCollection,
  onDragStart,
  onDragEnd,
}) {
  const isImdb = movie?.source === 'imdb';
  const cardRef = useRef(null);
  const panelPositionRef = useRef(null);
  const panelCloseTimeoutRef = useRef(null);
  const logoRequestRef = useRef(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState('save');
  const [panelPosition, setPanelPosition] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [fetchedLogo, setFetchedLogo] = useState(null);
  const controlled = typeof saved === 'boolean';
  const { isSaved, toggleSaved, collections, saveToCollection, createCollection, moveMovieToCollection } = useLibrary();
  const [selfSaved, setSelfSaved] = useState(() =>
    controlled ? saved : movie?.id ? isSaved(movie.id) : false,
  );

  // Keep the bookmark state in sync with external changes (and our own writes).
  // NOTE: dep uses movie?.id — a bare movie.id here throws during render when
  // a cloud snapshot is null, blanking the whole page.
  useEffect(() => {
    if (controlled) {
      setSelfSaved(!!saved);
      return;
    }
    if (!movie?.id) return;
    setSelfSaved(isSaved(movie.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlled, saved, movie?.id, isSaved]);

  if (!movie) return null;

  const title = movie.title || movie.name || 'Untitled';
  const poster = imgFailed
    ? null
    : isImdb
      ? movie.poster
      : getPosterUrl(movie.poster_path);
  const backdrop = getBackdropUrl(movie.backdrop_path, 780);
  const knownLogo = movie.logo_path
    ? getImageUrl(movie.logo_path, 342)
    : getLogoUrl(movie.images?.logos, 780);
  const logo = fetchedLogo || knownLogo;
  const rating = isImdb ? null : formatRating(movie.vote_average);
  const year = isImdb
    ? movie.year
      ? String(movie.year)
      : null
    : formatYear(movie.release_date ?? movie.first_air_date);
  const overview = movie.overview;
  const gradient = gradients[(index ?? 0) % gradients.length];
  const savedState = controlled ? saved : selfSaved;
  // TV entries (from /tv endpoints / IMDb type) expose `name` instead of `title`.
  const isTV = isImdb
    ? movie.type === 'tv'
    : movie.media_type === 'tv' || (movie.name && !movie.title);
  // IMDb-only results link to the lightweight IMDb detail page.
  const linkTo = to ?? (
    isImdb
      ? `/imdb/${movie.imdbId}`
      : isTV
        ? `/tv/${movie.id}`
        : `/movie/${movie.id}`
  );

  const loadOfficialLogo = () => {
    if (logo || logoRequestRef.current || isImdb || !movie.id) return;
    logoRequestRef.current = true;
    fetchMediaImages(isTV ? 'tv' : 'movie', movie.id)
      .then((images) => setFetchedLogo(getLogoUrl(images?.logos, 780)))
      .catch((error) => {
        console.error(`Unable to load the official logo for "${title}".`, error);
      });
  };

  const updatePanelPosition = useCallback(() => {
    const card = cardRef.current;
    if (!card || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    const rect = card.getBoundingClientRect();
    const gap = 12;
    const margin = 8;
    const width = Math.min(rect.width * 1.85, window.innerWidth - margin * 2);
    const detailsHeight = 96 + (overview ? 32 : 0);
    const height = Math.min(width * (9 / 16) + detailsHeight, window.innerHeight - margin * 2);
    const opensRight = rect.right + gap + width <= window.innerWidth - margin;
    const left = opensRight
      ? rect.right + gap
      : Math.max(margin, rect.left - gap - width);
    const top = Math.min(
      Math.max(margin, rect.top + (rect.height - height) / 2),
      window.innerHeight - height - margin,
    );
    const position = { left, top, width };
    panelPositionRef.current = position;
    setPanelPosition(position);
  }, []);

  useEffect(() => {
    const repositionActivePanel = () => {
      if (panelPositionRef.current) updatePanelPosition();
    };
    const closePanelOnScroll = () => {
      lastPageScrollAt = Date.now();
      if (!panelPositionRef.current) return;
      panelPositionRef.current = null;
      setPanelOpen(false);
      setPanelPosition(null);
    };
    window.addEventListener('resize', repositionActivePanel);
    window.addEventListener('scroll', closePanelOnScroll, true);
    return () => {
      window.removeEventListener('resize', repositionActivePanel);
      window.removeEventListener('scroll', closePanelOnScroll, true);
    };
  }, [updatePanelPosition]);

  const clearPanelCloseTimeout = () => {
    if (panelCloseTimeoutRef.current) {
      clearTimeout(panelCloseTimeoutRef.current);
      panelCloseTimeoutRef.current = null;
    }
  };

  const openPanel = () => {
    clearPanelCloseTimeout();
    if (
      !window.matchMedia('(hover: hover) and (pointer: fine)').matches
      || Date.now() - lastPageScrollAt < 250
    ) return;
    setPanelOpen(true);
    updatePanelPosition();
    loadOfficialLogo();
  };

  const closePanel = () => {
    clearPanelCloseTimeout();
    setPanelOpen(false);
    panelPositionRef.current = null;
    setPanelPosition(null);
  };

  const schedulePanelClose = () => {
    clearPanelCloseTimeout();
    panelCloseTimeoutRef.current = setTimeout(closePanel, 250);
  };

  const handleBookmark = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (controlled) {
      onToggleSaved?.(movie);
    } else if (selfSaved) {
      toggleSaved(movie).then((next) => setSelfSaved(next));
    } else {
      setPickerMode('save');
      setPickerOpen(true);
    }
  };

  return (
    <>
    <Link
      ref={cardRef}
      to={linkTo}
      aria-label={`View ${title}`}
      draggable={!!onDragStart}
      onDragStart={onDragStart ? (event) => onDragStart(event, movie) : undefined}
      onDragEnd={onDragEnd}
      onMouseEnter={openPanel}
      onMouseLeave={schedulePanelClose}
      onFocus={openPanel}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) closePanel();
      }}
      className={`group relative z-0 block aspect-[2/3] w-full rounded-md
                 bg-ink-raised text-left shadow transition duration-200
                 md:hover:z-30 md:hover:shadow-2xl focus:outline-none
                 focus-visible:ring-2 focus-visible:ring-brand ${onDragStart ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      {/* Poster / fallback backdrop */}
      {poster ? (
        <img
          src={poster}
          alt={`${title} poster`}
          loading="lazy"
          decoding="async"
          onError={() => setImgFailed(true)}
          className="absolute inset-0 h-full w-full rounded-md object-cover transition-[filter] duration-200
                     md:group-hover:blur-[2px] md:group-hover:brightness-50
                     md:group-focus-visible:blur-[2px] md:group-focus-visible:brightness-50"
        />
      ) : (
        <div className={`absolute inset-0 rounded-md bg-gradient-to-br ${gradient} opacity-80 transition-[filter] duration-200
                        md:group-hover:blur-[2px] md:group-hover:brightness-50
                        md:group-focus-visible:blur-[2px] md:group-focus-visible:brightness-50`}
             aria-hidden="true" />
      )}

      {/* Card content */}
      <div className="relative flex h-full flex-col justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent p-3">
        <span
          className="pointer-events-none absolute inset-0 z-[5] hidden items-center justify-center
                     bg-black/20 opacity-0 backdrop-blur-[2px] transition-opacity duration-200 md:flex
                     md:group-hover:opacity-100 md:group-focus-visible:opacity-100"
          aria-hidden="true"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white
                           shadow-xl shadow-black/40 transition-transform duration-200
                           group-hover:scale-100 group-focus-visible:scale-100 scale-75">
            <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 fill-current" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </span>

        {/* IMDb-only results carry a badge and no watchlist toggle */}
        {isImdb && (
          <span
            className="absolute right-2 top-2 z-10 rounded bg-amber-300/90 px-1.5 py-0.5 text-[10px]
                       font-black tracking-wide text-black shadow"
            title="Found via IMDb"
          >
            IMDb
          </span>
        )}

        {/* Bookmark (watch later) toggle — always available for TMDb titles */}
        {!isImdb && (
          <button
            type="button"
            onClick={handleBookmark}
            aria-pressed={savedState}
            aria-label={savedState ? 'Remove from Watchlist' : 'Add to Watchlist'}
            title={savedState ? 'Remove from Watchlist' : 'Add to Watchlist'}
            className="absolute left-1 top-1 z-10 flex h-7 w-6 items-center justify-center rounded-sm
                       border border-white/25 bg-black/35 text-white/90 backdrop-blur-sm
                       transition-[background-color,border-color,transform] duration-200
                       hover:border-white/60 hover:bg-black/60 focus-visible:outline-none
                       focus-visible:ring-2 focus-visible:ring-white/80 active:scale-95"
          >
            <svg viewBox="0 0 24 24" className={`h-4 w-4 ${
              savedState ? 'fill-brand stroke-brand' : 'fill-none stroke-current'
            }`} strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 3h12v18l-6-4-6 4V3z" />
            </svg>
          </button>
        )}

        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemove(movie);
            }}
            aria-label="Remove"
            title="Remove"
            className="absolute right-1 top-1 z-10 flex h-8 w-8 items-center justify-center rounded-full
                       bg-black/60 text-white/90 shadow transition hover:bg-brand"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6l-12 12" />
            </svg>
          </button>
        )}

        {!onRemove && typeof index === 'number' && (
          <span className="absolute right-2 top-2 text-4xl font-black text-white/30 drop-shadow">
            {index < 10 ? `0${index}` : index}
          </span>
        )}

        {rating && (
          <span className="mb-1 inline-flex w-fit items-center gap-1 rounded bg-black/50 px-1.5 py-0.5
                           text-[11px] font-bold text-amber-400">
            <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current" aria-hidden="true">
              <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.8 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" />
            </svg>
            {rating}
          </span>
        )}

        <span className="text-shadow-hero text-sm font-semibold leading-tight text-white">
          {title}
        </span>
        <span className="mt-1 flex items-center gap-2">
          {meta && (
            <span className="rounded bg-brand/15 px-1.5 text-[11px] font-bold leading-none text-brand-light">
              {meta}
            </span>
          )}
          {year && <span className="text-xs text-foreground/70">{year}</span>}
          <span className="h-px flex-1 bg-gradient-to-r from-white/40 to-transparent" />
        </span>

        {typeof progress === 'number' && (
          <span
            className="mt-1 h-1 w-full overflow-hidden rounded-full bg-ink-border"
            aria-label={`${Math.round(Math.max(0, Math.min(progress, 1)) * 100)}% watched`}
          >
            <span
              className="block h-full rounded-full bg-brand"
              style={{ width: `${Math.max(0, Math.min(progress, 1)) * 100}%` }}
            />
          </span>
        )}

        {/* Desktop-only reveal; touch users navigate directly through the card link. */}
        <span
          style={panelPosition ?? undefined}
          onMouseEnter={() => {
            clearPanelCloseTimeout();
            setPanelOpen(true);
          }}
          onMouseLeave={schedulePanelClose}
          className={`fixed z-50 hidden flex-col overflow-hidden rounded-lg
                      border border-white/10 bg-black shadow-2xl transition-opacity duration-200 md:flex ${
                        panelOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
                      }`}
        >
          <span className="relative aspect-video shrink-0">
            {backdrop ? (
              <img src={backdrop} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : poster ? (
              <img src={poster} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <span className={`block h-full w-full bg-gradient-to-br ${gradient}`} aria-hidden="true" />
            )}
            <span className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/10" />
            {rating && (
              <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded bg-black/70 px-2 py-1
                               text-xs font-bold text-white shadow">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-amber-400" aria-hidden="true">
                  <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.8 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" />
                </svg>
                {rating}
              </span>
            )}
            <span className="absolute inset-x-3 bottom-3 z-10">
              <span className="mb-2 flex min-h-8 items-end">
                {logo ? (
                  <img src={logo} alt={`${title} logo`} loading="lazy" className="max-h-10 max-w-full object-contain object-left-bottom" />
                ) : (
                  <span className="line-clamp-2 text-lg font-bold text-white">{title}</span>
                )}
              </span>
              <span className="flex flex-wrap items-center gap-2 text-xs font-medium text-white">
                <span>{isTV ? 'TV Show' : 'Movie'}</span>
                {rating && (
                  <span className="inline-flex items-center gap-1">
                    <svg viewBox="0 0 24 24" className="h-3 w-3 fill-amber-400" aria-hidden="true">
                      <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.8 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" />
                    </svg>
                    {rating}
                  </span>
                )}
                {year && <span>{year}</span>}
                {(movie.origin_country?.[0] || movie.original_language) && (
                  <span>{(movie.origin_country?.[0] || movie.original_language).toUpperCase()}</span>
                )}
              </span>
            </span>
          </span>
          <span className="relative z-10 flex shrink-0 flex-col px-3 pb-3 pt-0">
            <span className="mb-1 line-clamp-1 text-base font-bold text-white">{title}</span>
            {overview && (
              <span className="line-clamp-2 text-xs leading-snug text-gray-300">
                {overview}
              </span>
            )}
            <span className="mt-3 flex shrink-0 items-center gap-2">
              <span className="flex min-h-9 flex-1 items-center justify-center gap-2 rounded-md bg-brand px-2
                               text-xs font-bold text-white transition hover:bg-brand-dark">
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Watch Now
              </span>
              {!isImdb && (
                <button
                  type="button"
                  onClick={handleBookmark}
                  aria-pressed={savedState}
                  aria-label={savedState ? 'Remove from Watchlist' : 'Add to Watchlist'}
                  title={savedState ? 'Remove from Watchlist' : 'Add to Watchlist'}
                  className={`pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-md
                              border border-ink-border bg-ink-raised text-foreground transition
                              hover:border-brand hover:bg-brand hover:text-white
                              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                                savedState ? 'text-brand' : ''
                              }`}
                >
                  {savedState ? (
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor"
                         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m5 12 4 4L19 6" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor"
                         strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  )}
                </button>
              )}
              {onMoveToCollection && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPickerMode('move');
                    setPickerOpen(true);
                  }}
                  aria-label="Move to collection"
                  title="Move to collection"
                  className="pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-md
                             border border-white/40 bg-black/40 text-white transition hover:bg-white/20
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H10l2 2h7.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
                    <path d="M12 11v5m-2-2 2 2 2-2" />
                  </svg>
                </button>
              )}
            </span>
          </span>
          </span>
      </div>
    </Link>
    <CollectionPicker
      open={pickerOpen}
      collections={collections}
      title={pickerMode === 'move' ? 'Move to...' : 'Save to...'}
      movieTitle={title}
      allowCreate={pickerMode === 'save'}
      onClose={() => setPickerOpen(false)}
      onCreate={createCollection}
      onChoose={(collectionId) => {
        if (pickerMode === 'move') {
          return (onMoveToCollection || moveMovieToCollection)(movie.id, collectionId);
        }
        return saveToCollection(movie, collectionId);
      }}
    />
    </>
  );
}

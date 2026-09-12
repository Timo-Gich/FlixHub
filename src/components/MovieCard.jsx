import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getPosterUrl, formatRating, formatYear } from '../services/tmdbService';
import { gradients } from '../data/movies';

/**
 * A single movie tile fed from TMDb data.
 * Renders the real poster when available, otherwise a gradient placeholder.
 * Hovering reveals the overview and a play affordance. The whole card links to
 * the watch page for that movie.
 * Props:
 *   - movie : a TMDb movie object (title, poster_path, vote_average, …)
 *   - index : optional numeric rank shown in the corner
 */
export default function MovieCard({ movie, index }) {
  const [hover, setHover] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  if (!movie) return null;

  const title = movie.title || movie.name || 'Untitled';
  const poster = imgFailed ? null : getPosterUrl(movie.poster_path);
  const rating = formatRating(movie.vote_average);
  const year = formatYear(movie.release_date ?? movie.first_air_date);
  const overview = movie.overview;
  const gradient = gradients[index % gradients.length];

  return (
    <Link
      to={`/watch/${movie.id}`}
      aria-label={`Watch ${title}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="group relative block aspect-[2/3] w-full overflow-hidden rounded-md
                 bg-ink-raised text-left shadow transition duration-200
                 hover:scale-[1.04] hover:shadow-2xl focus:outline-none
                 focus-visible:ring-2 focus-visible:ring-brand"
    >
      {/* Poster / fallback backdrop */}
      {poster ? (
        <img
          src={poster}
          alt={`${title} poster`}
          loading="lazy"
          decoding="async"
          onError={() => setImgFailed(true)}
          className={`absolute inset-0 h-full w-full object-cover transition duration-200 ${
            hover ? 'scale-105 brightness-75' : ''
          }`}
        />
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-80`} aria-hidden="true" />
      )}

      {/* Card content */}
      <div className="relative flex h-full flex-col justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent p-3">
        {typeof index === 'number' && (
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
          {year && <span className="text-xs text-foreground/70">{year}</span>}
          <span className="h-px flex-1 bg-gradient-to-r from-white/40 to-transparent" />
        </span>

        {/* Hover overlay with overview + play */}
        <span
          className={`pointer-events-none absolute inset-0 flex flex-col items-stretch justify-end
                      bg-black/60 p-3 transition-opacity duration-200 ${
                        hover ? 'opacity-100' : 'opacity-0'
                      }`}
        >
          <span className="flex items-center gap-2">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand
                             shadow-lg shadow-brand/50 transition group-hover:scale-110"
                  aria-hidden="true">
              <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 fill-white" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
            {rating && (
              <span className="text-xs font-bold text-amber-400">★ {rating}</span>
            )}
          </span>
          {overview && (
            <span className="mt-2 line-clamp-4 text-xs leading-snug text-white/90">
              {overview}
            </span>
          )}
        </span>
      </div>
    </Link>
  );
}
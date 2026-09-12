import { getPosterUrl, formatYear } from '../services/tmdbService';

/**
 * Compact query-suggestion (autocomplete) dropdown rendered beneath the navbar
 * while the user is typing. Clicking a suggestion selects that title.
 * Props:
 *   - query       : current typed query (for the header label)
 *   - suggestions : array of TMDb movie objects
 *   - loading     : boolean
 *   - onSelect    : (movie) => void
 *   - onClose     : () => void
 */
export default function SearchSuggestions({ query, suggestions = [], loading, onSelect, onClose }) {
  return (
    <div className="border-b border-ink-border bg-ink/98 shadow-lg backdrop-blur">
      <div className="mx-auto max-w-[1600px] px-4 py-3 sm:px-8">
        {/* Header */}
        <div className="mb-2 flex items-center justify-between gap-4">
          <p className="text-xs uppercase tracking-wide text-muted">
            {loading ? `Searching “${query}”…` : `Suggestions for “${query}”`}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close suggestions"
            className="rounded p-1 text-muted transition hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-ink-raised" />
            ))}
          </div>
        ) : suggestions.length === 0 ? (
          <p className="py-3 text-sm text-muted">No matching suggestions.</p>
        ) : (
          <ul className="divide-y divide-ink-border">
            {suggestions.map((movie) => {
              const poster = getPosterUrl(movie.poster_path);
              const year = formatYear(movie.release_date ?? movie.first_air_date);
              const title = movie.title || movie.name || 'Untitled';
              return (
                <li key={movie.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(movie)}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left
                               transition hover:bg-ink-raised"
                  >
                    {poster ? (
                      <img
                        src={poster}
                        alt=""
                        loading="lazy"
                        className="h-11 w-8 shrink-0 rounded-sm object-cover bg-ink-raised"
                        onError={(e) => {
                          e.currentTarget.style.visibility = 'hidden';
                        }}
                      />
                    ) : (
                      <span className="flex h-11 w-8 shrink-0 items-center justify-center rounded-sm bg-gradient-to-br from-brand/60 to-ink-raised" aria-hidden="true">
                        <span className="text-[10px] font-black text-white/50">{title[0]?.toUpperCase() || '?'}</span>
                      </span>
                    )}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="line-clamp-1 text-sm font-semibold text-foreground">{title}</span>
                      {year && <span className="text-xs text-muted">{year}</span>}
                    </span>
                    <svg viewBox="0 0 24 24" className="h-4 w-4 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <path d="M6 12h12M12 6v12" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
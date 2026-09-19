import { useEffect, useRef, useState } from 'react';

const FILTER_OPTIONS = [
  { key: 'all', label: 'Filter' },
  { key: 'movie', label: 'Movies' },
  { key: 'tv', label: 'Series' },
];

/**
 * vidbox-style search pill: a single rounded translucent input whose left
 * ~85px is reserved for a "Filter" dropdown segment (separated by a subtle
 * divider), with a magnifier search icon affixed to the right.
 *
 * Props:
 *   - id             : unique input id
 *   - value          : current query string
 *   - onChange       : (nextValue) => void
 *   - onSubmit       : () => void
 *   - loading        : when true, shows a small spinner in place of the icon
 *   - filter         : current filter key ('all' | 'movie' | 'tv')
 *   - onFilterChange : (nextFilterKey) => void
 *   - placeholder    : input placeholder text
 *   - className      : extra classes forwarded to the wrapper
 */
export default function SearchPill({
  id = 'app-search',
  value = '',
  onChange,
  onSubmit,
  loading = false,
  filter = 'all',
  onFilterChange,
  placeholder = 'Search',
  className = '',
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef(null);

  // Close the dropdown on outside click or Escape.
  useEffect(() => {
    const onPointerDown = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setFilterOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setFilterOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const currentLabel =
    FILTER_OPTIONS.find((option) => option.key === filter)?.label ?? 'Filter';

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
        setFilterOpen(false);
      }}
      className={`relative ${className}`}
    >
      {/* Subtle divider separating the Filter segment from the input text */}
      <span
        className="pointer-events-none absolute inset-y-1 left-[84px] w-[1px] bg-ink-border/60"
        aria-hidden="true"
      />

      {/* Filter dropdown segment, occupying the reserved left zone */}
      <div ref={filterRef} className="absolute inset-y-0 left-0 flex w-[84px] items-center justify-center">
        <button
          type="button"
          onClick={() => setFilterOpen((open) => !open)}
          aria-haspopup="listbox"
          aria-expanded={filterOpen}
          className="flex cursor-pointer items-center gap-x-2 rounded-xl bg-black px-2 py-1
                    text-sm transition hover:bg-slate-800"
        >
          <svg viewBox="0 0 24 24" className="h-3 w-3 text-gray-500" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          <span className="text-sm text-gray-500">{currentLabel}</span>
        </button>

        {filterOpen && (
          <ul
            role="listbox"
            className="absolute left-2 top-full z-30 mt-1.5 w-32 rounded-md border border-ink-border
                       bg-ink/95 py-1 shadow-lg backdrop-blur"
          >
            {FILTER_OPTIONS.map((option) => (
              <li key={option.key} role="option">
                <button
                  type="button"
                  onClick={() => {
                    onFilterChange?.(option.key);
                    setFilterOpen(false);
                  }}
                  className={`block w-full px-2.5 py-1.5 text-left text-xs transition ${
                    filter === option.key ? 'font-semibold text-white' : 'text-muted hover:text-white'
                  }`}
                >
                  {option.label === 'Filter' ? 'All' : option.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <input
        id={id}
        type="search"
        inputMode="search"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="h-8 md:h-10 w-full rounded-3xl border-0 bg-black/50 pl-[85px] pr-10 text-sm
                   capitalize !text-white caret-white placeholder:text-gray-500
                   placeholder:text-center focus:placeholder:opacity-0
                   outline-none shadow-none focus:outline-none focus:ring-0 focus-visible:ring-0
                   transition-colors sm:w-64 md:w-72 lg:w-[450px]"
      />

      {/* Loading spinner or search icon (submit) on the right */}
      {loading && (
        <span className="pointer-events-none absolute inset-y-0 right-0 flex w-10 items-center justify-center">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-brand"
                aria-hidden="true" />
        </span>
      )}
      <button
        type="submit"
        aria-label="Search"
        className={`absolute inset-y-0 right-0 flex w-10 items-center justify-center text-white/70
                     transition hover:text-white ${loading ? 'hidden' : ''}`}
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
    </form>
  );
}
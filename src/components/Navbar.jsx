import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Logo from './Logo';
import SearchPill from './SearchPill';
import SearchResults from './SearchResults';
import SearchSuggestions from './SearchSuggestions';
import { searchAllWithImdb } from '../services/searchService';
import { cacheImdbItem } from '../services/imdbService';

const NAV_LINKS = [
  { key: 'home', label: 'Home', to: '/' },
  { key: 'movies', label: 'Movies', to: '/movies' },
  { key: 'series', label: 'Series', to: '/series' },
  { key: 'popular', label: 'New & Popular', to: '/new-popular' },
  { key: 'mylist', label: 'Watchlist', to: '/watch-later' },
  { key: 'history', label: 'History', to: '/history' },
];

// Debounced query-suggestion behaviour.
const DEBOUNCE_MS = 350; // Delay before suggestions are fetched while typing.
const MIN_SUGGEST_CHARS = 2; // Minimum query length to fetch suggestions.
const MAX_SUGGESTIONS = 6; // Max suggestions returned.

/**
 * Fixed top navigation bar in a three-section vidbox-style layout:
 *   left logo · center search pill · right icon group (theme + menu).
 * The primary nav links live inside the slide-out menu, and the search
 * collapses to an icon on small screens that expands back into the full pill.
 */
export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  const [themeDark, setThemeDark] = useState(true);

  // Search state.
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  // Debounced query-suggestion state.
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsActive, setSuggestionsActive] = useState(false);
  const queryRef = useRef(query);
  queryRef.current = query;

  const showSuggestions =
    suggestionsActive && query.trim() !== '' && submittedQuery === '';
  const showResults = submittedQuery !== '' || searching;

  // The "Filter" segment (All / Movies / Series) narrows suggestions + results
  // client-side by content type. "All" shows every result unchanged.
  const mediaTypeOf = (m) =>
    m?.source === 'imdb'
      ? m?.type === 'tv' ? 'tv' : 'movie'
      : m?.media_type === 'tv' ? 'tv' : 'movie';
  const filteredSuggestions =
    filter === 'all' ? suggestions : (suggestions || []).filter((m) => mediaTypeOf(m) === filter);
  const filteredResults =
    filter === 'all' ? results : (results || []).filter((m) => mediaTypeOf(m) === filter);

  // Typing in the field clears any committed results so we return to live
  // suggestions while the user refines their query.
  const handleChange = (value) => {
    setQuery(value);
    setSubmittedQuery('');
    setSearchError(null);
    setResults([]);
  };

  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Debounced query suggestions — fires only after the user pauses typing.
  useEffect(() => {
    const term = query.trim();
    if (term.length < MIN_SUGGEST_CHARS) {
      setSuggestionsActive(false);
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }
    setSuggestionsActive(true);
    setSuggestionsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await searchAllWithImdb(term);
        if (term !== queryRef.current.trim()) return; // stale response
        setSuggestions(data.results?.slice(0, MAX_SUGGESTIONS) ?? []);
      } catch {
        if (term === queryRef.current.trim()) setSuggestions([]);
      } finally {
        if (term === queryRef.current.trim()) setSuggestionsLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const runSearch = async (termOverride) => {
    const term = (termOverride ?? query).trim();
    if (!term) return;
    setSubmittedQuery(term);
    setSearching(true);
    setSearchError(null);
    setResults([]);
    setSuggestionsActive(false);
    setSuggestionsLoading(false);
    try {
      const data = await searchAllWithImdb(term);
      setResults(data.results ?? []);
    } catch (err) {
      setSearchError(err);
    } finally {
      setSearching(false);
    }
  };

  const closeResults = () => {
    setSubmittedQuery('');
    setSearchError(null);
    setResults([]);
  };

  const closeSuggestions = () => {
    setSuggestionsActive(false);
    setSuggestions([]);
    setSuggestionsLoading(false);
  };
// Clicking a suggestion or search result goes to its detail/player page.
  const openMovie = (movie) => {
    // IMDb-only results open the lightweight IMDb detail page.
    if (movie?.source === 'imdb') {
      if (movie?.imdbId) {
        cacheImdbItem(movie);
        navigate(`/imdb/${movie.imdbId}`);
      }
      return;
    }
    if (movie?.id == null) return;
    const isTv = movie.media_type === 'tv' || (movie.name && !movie.title);
    navigate(isTv ? `/tv/${movie.id}` : `/movie/${movie.id}`);
  };
return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled ? 'bg-ink/95 shadow-lg backdrop-blur' : 'bg-gradient-to-b from-black/80 to-transparent'
      }`}
    >
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-3 sm:gap-6 sm:px-8"
      >
        <Logo />

        {/* Center: full search pill on md+, collapsed to an icon on small screens */}
        <SearchPill
          id="desktop-search"
          value={query}
          onChange={handleChange}
          onSubmit={runSearch}
          loading={searching}
          filter={filter}
          onFilterChange={setFilter}
          className="hidden md:flex"
        />
        <button
          type="button"
          aria-label="Search"
          aria-expanded={mobileSearchOpen}
          aria-controls="mobile-search"
          onClick={() => {
            setMobileSearchOpen((open) => !open);
            setMenuOpen(false);
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted
                     transition hover:text-white md:hidden"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>

        {/* Right: compact icon group (no labels) */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label={themeDark ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => setThemeDark((dark) => !dark)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted
                       transition hover:text-white"
          >
            {themeDark ? (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <line x1="12" y1="2" x2="12" y2="4" />
                <line x1="12" y1="20" x2="12" y2="22" />
                <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
                <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
                <line x1="2" y1="12" x2="4" y2="12" />
                <line x1="20" y1="12" x2="22" y2="12" />
                <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
                <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="nav-menu"
            onClick={() => {
              setMenuOpen((open) => !open);
              setMobileSearchOpen(false);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted
                       transition hover:text-white"
          >
            {menuOpen ? (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
</div>
      </nav>

      {/* Mobile search row — expands beneath the bar when the icon is tapped */}
      {mobileSearchOpen && (
        <div
          id="mobile-search"
          className="animate-[dropdown_0.2s_ease-out] border-t border-ink-border bg-ink/98 px-4 py-3
                     backdrop-blur md:hidden"
        >
          <SearchPill
            id="mobile-search-input"
            value={query}
            onChange={handleChange}
            onSubmit={() => {
              runSearch();
              setMobileSearchOpen(false);
            }}
            loading={searching}
            filter={filter}
            onFilterChange={setFilter}
            className="w-full"
          />
        </div>
      )}

      {/* Slide-out dropdown menu with the primary links */}
      {menuOpen && (
        <div
          id="nav-menu"
          className="animate-[dropdown_0.2s_ease-out] border-t border-ink-border bg-ink/98 shadow-lg
                     backdrop-blur"
        >
          <div className="mx-auto max-w-[1600px] px-4 py-3 sm:px-8">
            <ul className="space-y-2">
              {NAV_LINKS.map((link) => {
                const active = link.to
                  ? (link.to === '/' ? pathname === '/' : pathname.startsWith(link.to))
                  : false;
                return (
                  <li key={link.key}>
                    {link.to ? (
                      <Link
                        to={link.to}
                        onClick={() => setMenuOpen(false)}
                        className={`block rounded-md px-3 py-2.5 text-sm transition hover:bg-ink-raised ${
                          active ? 'font-semibold text-white' : 'text-muted'
                        }`}
                      >
                        {link.label}
                      </Link>
                    ) : (
                      <a
                        href="#"
                        onClick={() => setMenuOpen(false)}
                        className="block rounded-md px-3 py-2.5 text-sm text-muted transition
                                   hover:bg-ink-raised hover:text-white"
                      >
                        {link.label}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {/* Query suggestions panel — shown while typing (debounced) */}
      {showSuggestions && (
        <SearchSuggestions
          query={query.trim()}
          suggestions={filteredSuggestions}
          loading={suggestionsLoading}
          onSelect={openMovie}
          onClose={closeSuggestions}
        />
      )}

      {/* Search results panel — shared across desktop and mobile */}
      {showResults && (
        <SearchResults
          query={submittedQuery}
          results={filteredResults}
          loading={searching}
          error={searchError}
          onSelect={openMovie}
          onClose={closeResults}
        />
      )}
    </header>
  );
}
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Logo from './Logo';
import SearchBar from './SearchBar';
import SearchResults from './SearchResults';
import SearchSuggestions from './SearchSuggestions';
import { searchAll } from '../services/tmdbService';

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
 * Fixed top navigation bar. On desktop: logo | search | avatar with a link row.
 * On mobile: logo | hamburger toggle with a slide-down drawer.
 *
 * The search is wired to the TMDb /search/movie endpoint. Submitting runs a
 * search and a shared results panel is rendered directly beneath the bar for
 * both layouts.
 */
export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

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

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

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
        const data = await searchAll(term);
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
      const data = await searchAll(term);
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
        className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3 sm:gap-5 sm:px-8"
      >
        <Logo />

        {/* Desktop links */}
        <ul className="ml-4 hidden items-center gap-5 lg:flex">
          {NAV_LINKS.map((link) => {
            const active = link.to ? (link.to === '/' ? pathname === '/' : pathname.startsWith(link.to)) : false;
            const cls = `text-sm transition hover:text-white ${
              active ? 'font-semibold text-foreground' : 'text-muted'
            }`;
            return (
              <li key={link.key}>
                {link.to ? (
                  <Link to={link.to} className={cls}>
                    {link.label}
                  </Link>
                ) : (
                  <a href="#" className={cls}>
                    {link.label}
                  </a>
                )}
              </li>
            );
          })}
        </ul>

        {/* Spacer keeps search centered-ish without flex-grow pushing it far */}
        <div className="flex-1 lg:flex-initial" />

        {/* Desktop search */}
        <SearchBar
          id="desktop-search"
          value={query}
          onChange={handleChange}
          onSubmit={runSearch}
          loading={searching}
          className="hidden max-w-sm md:block lg:w-64"
        />

        {/* Mobile hamburger toggle */}
        <button
          type="button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-drawer"
          onClick={() => setMenuOpen((open) => !open)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-white
                     transition hover:bg-ink-raised sm:hidden"
        >
          {menuOpen ? (
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>
      </nav>

      {/* Mobile drawer */}
      {menuOpen && (
        <div
          id="mobile-drawer"
          className="animate-[dropdown_0.2s_ease-out] border-t border-ink-border bg-ink/98 px-4 py-4
                     backdrop-blur sm:hidden"
        >
          <SearchBar
            id="mobile-search"
            value={query}
            onChange={handleChange}
            onSubmit={runSearch}
            loading={searching}
            className="mb-4"
          />
          <ul className="space-y-1">
            {NAV_LINKS.map((link) => {
              return (
                <li key={link.key}>
                  {link.to ? (
                    <Link
                      to={link.to}
                      onClick={() => setMenuOpen(false)}
                      className="block rounded-md px-3 py-2.5 transition hover:bg-ink-raised
                                 text-foreground"
                    >
                      {link.label}
                    </Link>
                  ) : (
                    <a
                      href="#"
                      onClick={() => setMenuOpen(false)}
                      className="block rounded-md px-3 py-2.5 transition hover:bg-ink-raised
                                 text-foreground"
                    >
                      {link.label}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Query suggestions panel — shown while typing (debounced) */}
      {showSuggestions && (
        <SearchSuggestions
          query={query.trim()}
          suggestions={suggestions}
          loading={suggestionsLoading}
          onSelect={openMovie}
          onClose={closeSuggestions}
        />
      )}

      {/* Search results panel — shared across desktop and mobile */}
      {showResults && (
        <SearchResults
          query={submittedQuery}
          results={results}
          loading={searching}
          error={searchError}
          onSelect={openMovie}
          onClose={closeResults}
        />
      )}
    </header>
  );
}
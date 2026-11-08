import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Logo from './Logo';
import AccountMenu from './AccountMenu';
import NotificationBell from './NotificationBell';
import SearchPill from './SearchPill';
import SearchResults from './SearchResults';
import SearchSuggestions from './SearchSuggestions';
import { searchAllWithImdb } from '../services/searchService';
import { cacheImdbItem } from '../services/imdbService';

const NAV_LINKS = [
  { key: 'home', label: 'Home', to: '/' },
  { key: 'movies', label: 'Movies', to: '/movies' },
  { key: 'series', label: 'Series', to: '/series' },
  { key: 'live', label: 'Live TV', to: '/live' },
  { key: 'popular', label: 'New & Popular', to: '/new-popular' },
  { key: 'discover', label: 'Discover', to: '/discover' },
  { key: 'mylist', label: 'Watchlist', to: '/watch-later' },
  { key: 'history', label: 'History', to: '/history' },
  { key: 'account', label: 'Account', to: '/account' },
];

// Session in-app back stack (module scope so it survives component remounts
// during normal navigation without being reset on every page render).
let backStack = [];

// Monochrome line-style icons used for each hamburger-menu item (consistent set).
const MENU_ICONS = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9.5 12 3l9 6.5" />
      <path d="M5 10.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9.5" />
    </svg>
  ),
  movies: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4" />
    </svg>
  ),
  series: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="m17 2-5 5-5-5" />
    </svg>
  ),
  live: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="7" width="20" height="15" rx="2" />
      <path d="M17 7l4-4M8 7V4M6 2l-3 3" />
    </svg>
  ),
  popular: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  ),
  discover: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m16 16 4.5 4.5M11 7v4l2.5 1.5" />
    </svg>
  ),
  mylist: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  ),
  history: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  ),
  account: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
};

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
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('flixhub-theme');
      if (saved === 'dark' || saved === 'cinema') return saved;
    } catch {
      /* ignore storage errors */
    }
    return 'dark';
  });

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

  // Routes that are self-contained players with their own contextual "Back"
  // button (in the player bar). The global arrow is hidden there so each
  // screen ends up with exactly one back affordance.
  const PLAYER_PREFIXES = ['/watch', '/live/'];
  const isPlayerPath = (p) => PLAYER_PREFIXES.some((seg) => p.startsWith(seg));

  // Keep an in-app stack of previously visited routes so "back" stays inside
  // the app (never exiting to an external referrer) and doesn't depend on the
  // browser's history length, which also counts pages outside this router.
  const backingRef = useRef(false);
  const initRef = useRef(false);
  const prevPathRef = useRef('/');

  useEffect(() => {
    if (backingRef.current) {
      // We just returned via the arrow — the target was already popped, so
      // don't re-seed the stack with the page we came back to.
      backingRef.current = false;
      prevPathRef.current = pathname;
      return;
    }
    if (initRef.current) {
      backStack.push(prevPathRef.current);
      // Bound session growth so a long browsing session can't balloon memory.
      if (backStack.length > 60) backStack.shift();
    }
    initRef.current = true;
    prevPathRef.current = pathname;
  }, [pathname]);

  // Show a back arrow on every page except Home and the full-screen players.
  const showBack = pathname !== '/' && !isPlayerPath(pathname);
  const goBack = () => {
    const target = backStack.pop();
    backingRef.current = true;
    if (target && target !== pathname) navigate(target);
    else navigate('/', { replace: true }); // deep link / fresh session -> Home
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Apply the active theme (dark charcoal+red, or cinema teal+amber) to <html>.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('flixhub-theme', theme);
    } catch {
      /* ignore storage errors */
    }
  }, [theme]);

  // Global search shortcut: "/" or Ctrl/Cmd+K focuses the desktop search pill on
  // md+ screens, or reveals the mobile search bar on small screens. Ignored while
  // the user is already typing in a field.
  useEffect(() => {
    const isTypingTarget = (target) => {
      const tag = target?.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable
      );
    };
    const onKeyDown = (e) => {
      const isSlash = e.key === '/';
      const isSearchShortcut =
        e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k');
      if (!isSearchShortcut || isTypingTarget(e.target)) return;
      e.preventDefault();
      const desktop = document.getElementById('desktop-search');
      // The desktop pill's wrapper is hidden below md, so only focus it when visible.
      const desktopVisible =
        desktop && desktop.closest('form') && getComputedStyle(desktop.closest('form')).display !== 'none';
      if (desktopVisible) {
        desktop.focus();
        desktop.select?.();
        return;
      }
      setMobileSearchOpen(true);
      setMenuOpen(false);
      // Focus the mobile input once it has rendered on the next frame.
      setTimeout(() => document.getElementById('mobile-search-input')?.focus(), 60);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
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
        scrolled || pathname !== '/' ? 'bg-ink/95 shadow-lg backdrop-blur' : 'bg-transparent'
      }`}
    >
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-3 sm:gap-6 sm:px-8"
      >
        <div className="flex items-center">
          {showBack && (
            <button
              type="button"
              onClick={goBack}
              aria-label="Go back to previous page"
              className="mr-1 flex h-8 w-8 items-center justify-center rounded-full text-white/80
                         transition hover:bg-white/10 hover:text-white md:h-9 md:w-9"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor"
                   strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 12H5" />
                <path d="m12 19-7-7 7-7" />
              </svg>
            </button>
          )}
          <Logo />
        </div>

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
        <div className="relative flex shrink-0 items-center gap-2">
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
          <button
            type="button"
            aria-label={theme === 'dark' ? 'Switch to cinema theme' : 'Switch to dark theme'}
            onClick={() => setTheme((prev) => (prev === 'dark' ? 'cinema' : 'dark'))}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted
                       transition hover:text-white"
          >
            {theme === 'dark' ? (
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
          <NotificationBell />
          <AccountMenu />
          {menuOpen && (
            <div
              id="nav-menu"
              role="menu"
              className="absolute right-0 top-full z-30 mt-3 w-60 origin-top-right
                           animate-[menudrop_0.18s_ease-out] overflow-hidden rounded-2xl border
                           border-ink-border bg-ink-raised/95 p-1.5 shadow-2xl shadow-black/40
                           backdrop-blur"
            >
              <ul>
                {NAV_LINKS.map((item) => {
                  const active = item.to
                    ? (item.to === '/' ? pathname === '/' : pathname.startsWith(item.to))
                    : false;
                  const itemMarkup = (
                    <>
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center ${active ? 'text-brand-light' : 'text-muted/70'}`}>
                        {MENU_ICONS[item.key]}
                      </span>
                      <span className="flex-1">{item.label}</span>
                      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-light" aria-hidden="true" />}
                    </>
                  );
                  const cls = `flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                    active ? 'bg-white/10 font-medium text-white' : 'text-muted hover:bg-white/5 hover:text-white'
                  }`;
                  return (
                    <li key={item.key} className="mb-0.5 last:mb-0">
                      {item.to ? (
                        <Link to={item.to} role="menuitem" onClick={() => setMenuOpen(false)} className={cls}>
                          {itemMarkup}
                        </Link>
                      ) : (
                        <a href="#" role="menuitem" onClick={() => setMenuOpen(false)} className={cls}>
                          {itemMarkup}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
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

      {/* Nav-hamburger menu is rendered inside the right icon group above. */}

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
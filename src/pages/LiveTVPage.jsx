import { useEffect, useMemo, useRef, useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import LiveChannelCard from '../components/LiveChannelCard';
import { fetchPlaylist, EPG_REGIONS, LIVE_SOURCES } from '../services/liveTvService';
import { getFavoritesLive, subscribeLibrary } from '../services/libraryService';

const REGION_KEY = 'flixhub.liveRegion';

function readRegion() {
  try {
    const saved = localStorage.getItem(REGION_KEY);
    if (saved && EPG_REGIONS.some((r) => r.code === saved)) return saved;
  } catch {
    /* ignore storage errors */
  }
  return 'US';
}

const SOURCE_KEY = 'flixhub.liveSource';

function readSource() {
  try {
    const saved = localStorage.getItem(SOURCE_KEY);
    if (saved && LIVE_SOURCES.some((s) => s.id === saved)) return saved;
  } catch {
    /* ignore storage errors */
  }
  return 'world-iptv';
}

const TAB_ALL = '__all__';
const TAB_FAVORITES = '__favorites__';
// Render a bounded grid and reveal more on demand — rendering all ~11k channels
// at once made the whole app sluggish.
const PAGE_SIZE = 48;

// The active category/search are kept in sessionStorage so returning from a
// channel player lands the user back on the same tab they were viewing.
const LIVE_TAB_KEY = 'flixhub.liveTab';
const LIVE_QUERY_KEY = 'flixhub.liveQuery';

function readStoredTab() {
  try {
    return sessionStorage.getItem(LIVE_TAB_KEY) || TAB_ALL;
  } catch {
    return TAB_ALL;
  }
}

function readStoredQuery() {
  try {
    return sessionStorage.getItem(LIVE_QUERY_KEY) || '';
  } catch {
    return '';
  }
}

/**
 * /live — channel browser for continuous live TV.
 * Offers a source selector (World IP TV, Kenya, …), a region selector (drives
 * the EPG country), a Favorites tab, category tabs derived from group-title
 * (skipped for single-group sources like Kenya, which render one flat grid), a
 * client-side search box, and a responsive grid of live-channel cards.
 */
export default function LiveTVPage() {
  const [channels, setChannels] = useState(null); // null = loading
  const [error, setError] = useState(false);
  const [region, setRegion] = useState(readRegion);
  const [source, setSource] = useState(readSource);
  const [tab, setTab] = useState(readStoredTab);
  const [query, setQuery] = useState(readStoredQuery);
  const [favState, setFavState] = useState(() => getFavoritesLive());
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    setChannels(null);
    fetchPlaylist(source).then((list) => {
      if (cancelled) return;
      if (!list.length) setError(true);
      setChannels(list);
    });
    return () => {
      cancelled = true;
    };
  }, [source]);

  // Keep favorites in sync with the library service.
  useEffect(() => subscribeLibrary(() => setFavState(getFavoritesLive())), []);

  // Persist the chosen region so the player page can use it for EPG.
  useEffect(() => {
    try {
      localStorage.setItem(REGION_KEY, region);
    } catch {
      /* ignore storage errors */
    }
  }, [region]);

  // Persist the chosen source so it survives navigation / reloads.
  useEffect(() => {
    try {
      localStorage.setItem(SOURCE_KEY, source);
    } catch {
      /* ignore storage errors */
    }
  }, [source]);

  // Switching sources resets to a fresh view — "All" tab, no search, top of grid.
  const prevSourceRef = useRef(source);
  useEffect(() => {
    if (prevSourceRef.current !== source) {
      prevSourceRef.current = source;
      setTab(TAB_ALL);
      setQuery('');
      setPage(1);
    }
  }, [source]);

  // Remember the active tab & search across the session so returning from a
  // channel player restores the view the user was on.
  useEffect(() => {
    try {
      sessionStorage.setItem(LIVE_TAB_KEY, tab);
    } catch {
      /* ignore storage errors */
    }
  }, [tab]);

  useEffect(() => {
    try {
      sessionStorage.setItem(LIVE_QUERY_KEY, query);
    } catch {
      /* ignore storage errors */
    }
  }, [query]);

  const loading = channels === null && !error;

  const categories = useMemo(() => {
    const set = new Set();
    (channels || []).forEach((c) => {
      if (c.category) set.add(c.category);
    });
    return ['News', 'Sports', 'Movies', 'Music', 'Entertainment']
      .filter((c) => set.has(c))
      .concat([...set].sort((a, b) => a.localeCompare(b)));
  }, [channels]);

  // If the restored tab no longer matches a real category (stale playlist or
  // session), fall back to "All" once the category list is known.
  useEffect(() => {
    if (loading) return;
    const flat = source === 'kenya';
    const valid =
      tab === TAB_ALL ||
      tab === TAB_FAVORITES ||
      (!flat && categories.includes(tab));
    if (!valid) setTab(TAB_ALL);
  }, [loading, tab, categories, source]);

  const favorites = useMemo(() => favState.map((e) => e.channel), [favState]);
// Apply tab + search filtering client-side.
  const visible = useMemo(() => {
    let list = channels || [];
    if (tab === TAB_FAVORITES) list = favorites;
    else if (tab !== TAB_ALL) list = list.filter((c) => c.category === tab);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((c) => (c.name || '').toLowerCase().includes(q));
    return list;
  }, [channels, tab, favorites, query]);

  // Kenya (and other single-group sources) skip the category row entirely and
  // show every channel in one flat grid — avoids a filter with a single option.
  const categoryTabs =
    source === 'kenya' ? [] : categories.map((c) => ({ key: c, label: c }));
  const tabs = [
    { key: TAB_ALL, label: 'All' },
    {
      key: TAB_FAVORITES,
      label: `Favorites${favorites.length ? ` (${favorites.length})` : ''}`,
    },
    ...categoryTabs,
  ];

  const emptyVisible = !loading && !error && visible.length === 0;

  // Reset pagination whenever the grid's input set changes.
  useEffect(() => {
    setPage(1);
  }, [tab, query, favState, channels]);

  const shownCount = Math.min(page * PAGE_SIZE, visible.length);
  const paged = visible.slice(0, shownCount);
  const hasMore = shownCount < visible.length;

  const retry = () => {
    setError(false);
    setChannels(null);
    fetchPlaylist(source).then((list) => {
      if (!list.length) setError(true);
      setChannels(list);
    });
  };
return (
    <div className="min-h-screen bg-ink text-foreground">
      <Navbar />

      <main className="mx-auto w-full max-w-[1600px] px-4 pt-24 sm:px-8">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor"
                     strokeWidth="1.6" aria-hidden="true">
                  <rect x="2" y="7" width="20" height="15" rx="2" />
                  <path d="M10 11.5v1.8a1 1 0 0 0 1.5.9l1.6-.9a1 1 0 0 0 0-1.8l-1.6-.9a1 1 0 0 0-1.5.9z" />
                  <path d="M7 17h10" />
                </svg>
              </span>
              <h1 className="text-2xl font-black text-white sm:text-3xl">Live TV</h1>
            </div>
            <p className="mt-1 text-sm text-muted">
              Enjoy your favourite shows, live as they happen.
            </p>
          </div>

          {/* Source + region selectors */}
          <div className="flex flex-wrap items-center gap-2">
            {LIVE_SOURCES.filter((s) => s.urls && s.urls.length).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSource(s.id)}
                aria-pressed={source === s.id}
                title={s.description}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                  source === s.id
                    ? 'bg-brand text-white'
                    : 'bg-ink-raised text-muted hover:bg-ink-border hover:text-white'
                }`}
              >
                {s.label}
              </button>
            ))}
            <label className="flex items-center gap-2 text-sm text-muted">
              <span className="hidden sm:inline">EPG region</span>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="rounded-md border border-ink-border bg-ink-raised px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand/40"
              >
                {EPG_REGIONS.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Search */}
        <div className="relative mt-5 max-w-md">
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
               fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search channels by name…"
            aria-label="Search channels"
            className="w-full rounded-md border border-ink-border bg-ink-raised py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/40"
          />
        </div>

        {/* Category tabs */}
        <div className="scrollbar-hide mt-6 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-8 sm:px-8">
          {tabs.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  active
                    ? 'bg-brand text-white'
                    : 'bg-ink-raised text-muted hover:bg-ink-border hover:text-white'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="mt-6 pb-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-24 text-muted">
              <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" aria-hidden="true" />
              <p className="mt-4 text-sm">Loading channels…</p>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-ink-border bg-ink-soft px-6 py-16 text-center">
              <p className="text-3xl font-black text-white">Couldn’t load channels</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted">
                The live TV playlist is temporarily unreachable. Check your connection and try again.
              </p>
              <button
                type="button"
                onClick={retry}
                className="mt-6 inline-block rounded-md bg-brand px-6 py-2.5 text-sm font-bold text-white transition hover:bg-brand-dark"
              >
                Try again
              </button>
            </div>
          )}

          {tab === TAB_FAVORITES && !error && favorites.length === 0 && !loading && (
            <div className="rounded-md border border-ink-border bg-ink-soft px-6 py-16 text-center">
              <p className="text-3xl font-black text-white">No favorite channels yet</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted">
                Tap the ♥ on any live channel to pin it here and jump straight back in.
              </p>
            </div>
          )}

          {tab !== TAB_FAVORITES && !error && emptyVisible && (
            <div className="rounded-md border border-ink-border bg-ink-soft px-6 py-16 text-center">
              <p className="text-3xl font-black text-white">No channels found</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted">Try a different category or search term.</p>
            </div>
          )}

          {!loading && !error && !emptyVisible && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {paged.map((ch) => (
                <LiveChannelCard key={ch.id} channel={ch} />
              ))}
            </div>
          )}

          {!loading && !error && hasMore && (
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-ink-border bg-ink-raised px-6 py-2.5 text-sm font-semibold text-white transition hover:border-brand hover:bg-brand"
              >
                Load more {Math.min(PAGE_SIZE, visible.length - shownCount)}
              </button>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
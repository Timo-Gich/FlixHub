import { useEffect, useMemo, useRef, useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import LiveChannelCard from '../components/LiveChannelCard';
import VoiceSearchButton from '../components/VoiceSearchButton';
import { DADDYLIVE_CHANNELS } from '../data/daddyliveChannels';
import { fetchPlaylist, resetPlaylistCache } from '../services/liveTvService';
import { useLibrary } from '../hooks/useLibrary.jsx';
import useVoiceSearch from '../hooks/useVoiceSearch';

const COUNTRY_KEY = 'flixhub.liveCountry';
const COUNTRY_ALL = '__all__';
const SOURCE_KEY = 'flixhub.liveSource';
const DEFAULT_SOURCE = 'default';
const DADDYLIVE_SOURCE = 'daddylive';
const DADDYLIVE_CHANNELS_WITH_SOURCE = DADDYLIVE_CHANNELS.map((channel) => ({
  ...channel,
  source: DADDYLIVE_SOURCE,
}));
const DADDYLIVE_CHANNELS_BY_ID = new Map(
  DADDYLIVE_CHANNELS_WITH_SOURCE.map((channel) => [String(channel.id), channel]),
);

function readSource() {
  try {
    return localStorage.getItem(SOURCE_KEY) === DADDYLIVE_SOURCE ? DADDYLIVE_SOURCE : DEFAULT_SOURCE;
  } catch {
    return DEFAULT_SOURCE;
  }
}

function readCountry() {
  try {
    return localStorage.getItem(COUNTRY_KEY) || COUNTRY_ALL;
  } catch {
    return COUNTRY_ALL;
  }
}

function countryLabel(code) {
  const normalized = code.toUpperCase();
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(normalized) || normalized;
  } catch {
    return normalized;
  }
}

const TAB_ALL = '__all__';
const TAB_FAVORITES = '__favorites__';
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
 * /live — Live TV channel browser with favorites, search, and filtering.
 */
export default function LiveTVPage({ initialSource = readSource() }) {
  const [channels, setChannels] = useState(null); // null = loading
  const [error, setError] = useState(false);
  const [source, setSource] = useState(initialSource);
  const [country, setCountry] = useState(readCountry);
  const [tab, setTab] = useState(readStoredTab);
  const [query, setQuery] = useState(readStoredQuery);
  const {
    supported: voiceSearchSupported,
    listening: voiceListening,
    error: voiceSearchError,
    toggle: toggleVoiceSearch,
  } = useVoiceSearch(setQuery);
  const { favoritesLive: favState } = useLibrary();
  const [page, setPage] = useState(1);
  const tabRailRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateRailArrows = () => {
    const el = tabRailRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateRailArrows();
    window.addEventListener('resize', updateRailArrows);
    return () => window.removeEventListener('resize', updateRailArrows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels]);

  const scrollRail = (dir) => {
    const el = tabRailRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.6), behavior: 'smooth' });
  };

  // Keep the active tab visible when it changes.
  useEffect(() => {
    const el = tabRailRef.current;
    if (!el) return;
    const active = el.querySelector('[data-active="true"]');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [tab]);

  useEffect(() => {
    if (source !== DEFAULT_SOURCE) return undefined;
    let cancelled = false;
    setError(false);
    fetchPlaylist().then((list) => {
      if (cancelled) return;
      if (!list.length) setError(true);
      setChannels(list);
    });
    return () => {
      cancelled = true;
    };
  }, [source]);

  // Favorites come from the cloud-aware hook — no local subscription needed.

  useEffect(() => {
    try {
      localStorage.setItem(COUNTRY_KEY, country);
    } catch {
      /* ignore storage errors */
    }
  }, [country]);

  useEffect(() => {
    try {
      localStorage.setItem(SOURCE_KEY, source);
    } catch {
      /* ignore storage errors */
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
    // Dedupe: priority cats first, then the rest alphabetically.
    const priority = ['News', 'Sports', 'Movies', 'Music', 'Entertainment'].filter((c) => set.has(c));
    const rest = [...set].filter((c) => !priority.includes(c)).sort((a, b) => a.localeCompare(b));
    return [...priority, ...rest];
  }, [channels]);

  const countries = useMemo(() => {
    const codes = new Set((channels || []).map((channel) => channel.country).filter((code) => /^[a-z]{2}$/i.test(code || '')));
    return [...codes].sort((a, b) => countryLabel(a).localeCompare(countryLabel(b)));
  }, [channels]);

  // If the restored tab no longer matches a real category (stale playlist or
  // session), fall back to "All" once the category list is known.
  useEffect(() => {
    if (source !== DEFAULT_SOURCE || loading) return;
    const valid =
      tab === TAB_ALL || tab === TAB_FAVORITES || categories.includes(tab);
    if (!valid) setTab(TAB_ALL);
  }, [source, loading, tab, categories]);

  const favorites = useMemo(() => favState.map((entry) => {
    const channel = entry.channel;
    if (channel?.source === DADDYLIVE_SOURCE) return channel;
    const knownDaddyLiveChannel = DADDYLIVE_CHANNELS_BY_ID.get(String(channel?.id));
    return knownDaddyLiveChannel?.name === channel?.name
      ? { ...channel, source: DADDYLIVE_SOURCE }
      : channel;
  }), [favState]);
  const altLiveChannels = DADDYLIVE_CHANNELS_WITH_SOURCE;

  // Apply tab + search filtering client-side.
  const visible = useMemo(() => {
    let list = channels || [];
    if (tab === TAB_FAVORITES) list = favorites;
    else if (tab !== TAB_ALL) list = list.filter((c) => c.category === tab);
    if (country !== COUNTRY_ALL) list = list.filter((c) => c.country?.toUpperCase() === country);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((c) => (c.name || '').toLowerCase().includes(q));
    return list;
  }, [channels, tab, favorites, country, query]);

  const altVisible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? altLiveChannels.filter((channel) => channel.name.toLowerCase().includes(q))
      : altLiveChannels;
  }, [query]);

  const tabs = [
    { key: TAB_ALL, label: 'All' },
    {
      key: TAB_FAVORITES,
      label: `Favorites${favorites.length ? ` (${favorites.length})` : ''}`,
    },
    ...categories.map((c) => ({ key: c, label: c })),
  ];

  const emptyVisible = !loading && !error && visible.length === 0;

  // Reset pagination whenever the grid's input set changes.
  useEffect(() => {
    setPage(1);
  }, [source, tab, query, favState, channels, country]);

  const shownCount = Math.min(page * PAGE_SIZE, visible.length);
  const paged = visible.slice(0, shownCount);
  const hasMore = shownCount < visible.length;

  const retry = () => {
    setError(false);
    setChannels(null);
    resetPlaylistCache();
    fetchPlaylist().then((list) => {
      if (!list.length) setError(true);
      setChannels(list);
    });
  };
  const channelCount = source === DADDYLIVE_SOURCE ? altVisible.length : visible.length;
  const channelCountLabel = loading && source === DEFAULT_SOURCE
    ? 'Loading channels'
    : `${channelCount.toLocaleString()} ${channelCount === 1 ? 'channel' : 'channels'}`;
  const activeTabLabel = tabs.find((item) => item.key === tab)?.label || 'All channels';

  return (
    <div className="min-h-screen overflow-hidden bg-ink text-foreground">
      <Navbar />

      <main className="mx-auto w-full max-w-[1600px] px-4 pb-12 pt-24 sm:px-8">
        <section className="relative isolate overflow-hidden rounded-3xl border border-white/10 bg-[#111116] px-6 py-10 shadow-2xl shadow-black/20 sm:px-10 lg:px-14">
          <div className="pointer-events-none absolute -right-20 -top-32 -z-10 h-96 w-96 rounded-full bg-brand/20 blur-3xl" />
          <div className="pointer-events-none absolute bottom-[-10rem] right-1/4 -z-10 h-72 w-72 rounded-full bg-fuchsia-600/10 blur-3xl" />
          <div className="pointer-events-none absolute right-8 top-1/2 -z-10 h-36 w-36 -translate-y-1/2 rounded-full border border-white/[0.08] sm:right-16 sm:h-48 sm:w-48" />
          <div className="pointer-events-none absolute right-14 top-1/2 -z-10 h-24 w-24 -translate-y-1/2 rounded-full border border-white/[0.08] sm:right-24 sm:h-32 sm:w-32" />
          <div className="relative">
            <h1 className="text-3xl font-black leading-none tracking-tight text-white sm:text-4xl md:text-5xl">
              Live TV, <span className="text-brand-light">your way.</span>
            </h1>
          </div>
        </section>

        <section className="mt-7" aria-label="Find live channels">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative min-w-0 flex-1">
              <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                id="live-channel-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search channels…"
                aria-label="Search channels"
                className={`h-12 w-full rounded-xl border border-white/10 bg-white/[0.045] pl-12 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-brand/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-brand/20 ${
                  voiceSearchSupported ? 'pr-14' : 'pr-4'
                }`}
              />
              <VoiceSearchButton
                supported={voiceSearchSupported}
                listening={voiceListening}
                onClick={toggleVoiceSearch}
                className="absolute right-2 top-1/2 h-9 w-9 -translate-y-1/2 rounded-lg hover:bg-white/[0.08]"
              />
              {voiceSearchError && (
                <span
                  role="status"
                  className="absolute left-2 top-full z-50 mt-1 rounded-lg border border-ink-border bg-ink px-3 py-1.5 text-xs text-foreground shadow-lg"
                >
                  {voiceSearchError}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-xl border border-white/10 bg-white/[0.045] p-1" role="group" aria-label="Live TV source">
                <button
                  type="button"
                  aria-pressed={source === DEFAULT_SOURCE}
                  onClick={() => setSource(DEFAULT_SOURCE)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${source === DEFAULT_SOURCE ? 'bg-brand text-white shadow-lg shadow-brand/20' : 'text-white/55 hover:text-white'}`}
                >
                  IPTV
                </button>
                <button
                  type="button"
                  aria-pressed={source === DADDYLIVE_SOURCE}
                  onClick={() => setSource(DADDYLIVE_SOURCE)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${source === DADDYLIVE_SOURCE ? 'bg-brand text-white shadow-lg shadow-brand/20' : 'text-white/55 hover:text-white'}`}
                >
                  DaddyLive
                </button>
              </div>
              {source === DEFAULT_SOURCE && (
                <label className="flex h-12 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-3 text-sm text-white/55">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
                    <circle cx="12" cy="10" r="2.5" />
                  </svg>
                  <span className="sr-only">Country</span>
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    aria-label="Filter channels by country"
                    className="max-w-40 cursor-pointer bg-transparent text-sm text-white outline-none"
                  >
                    <option value={COUNTRY_ALL}>All countries</option>
                    {countries.map((code) => (
                      <option key={code} value={code.toUpperCase()} className="bg-ink-raised">
                        {countryLabel(code)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>
        </section>

        {source === DEFAULT_SOURCE && (
          <section className="relative mt-8" aria-label="Channel categories">
            {canScrollLeft && (
              <button
                type="button"
                onClick={() => scrollRail(-1)}
                aria-label="Scroll categories left"
                className="absolute -left-2 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-ink-raised/95 text-white shadow-xl backdrop-blur transition hover:border-brand/50 hover:bg-ink-raised sm:flex"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
            )}
            {canScrollRight && (
              <button
                type="button"
                onClick={() => scrollRail(1)}
                aria-label="Scroll categories right"
                className="absolute -right-2 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-ink-raised/95 text-white shadow-xl backdrop-blur transition hover:border-brand/50 hover:bg-ink-raised sm:flex"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            )}
            <div
              ref={tabRailRef}
              onScroll={updateRailArrows}
              className="scrollbar-hide flex gap-2 overflow-x-auto scroll-smooth px-0.5 pb-1"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {tabs.map((t) => {
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    aria-pressed={active}
                    data-active={active}
                    onClick={() => setTab(t.key)}
                    className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                      active
                        ? 'border-brand bg-brand text-white shadow-lg shadow-brand/15'
                        : 'border-white/[0.08] bg-white/[0.045] text-white/60 hover:border-white/20 hover:bg-white/[0.08] hover:text-white'
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section className="mt-8 pb-4" aria-label="Live channels">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-light">
                {source === DADDYLIVE_SOURCE ? 'DaddyLive' : 'Browse'}
              </p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {source === DADDYLIVE_SOURCE ? 'Channel lineup' : activeTabLabel}
              </h2>
            </div>
            <p className="shrink-0 pb-1 text-xs font-medium text-white/45 sm:text-sm">{channelCountLabel}</p>
          </div>

          {source === DEFAULT_SOURCE && loading && (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.025] text-muted">
              <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" aria-hidden="true" />
              <p className="mt-4 text-sm">Finding your channels…</p>
            </div>
          )}

          {source === DEFAULT_SOURCE && error && (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-6 py-16 text-center">
              <p className="text-2xl font-black text-white sm:text-3xl">Couldn’t load channels</p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
                The live TV playlist is temporarily unreachable. Check your connection and try again.
              </p>
              <button
                type="button"
                onClick={retry}
                className="mt-6 rounded-lg bg-brand px-6 py-2.5 text-sm font-bold text-white transition hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand/50 focus:ring-offset-2 focus:ring-offset-ink"
              >
                Try again
              </button>
            </div>
          )}

          {source === DEFAULT_SOURCE && tab === TAB_FAVORITES && !error && favorites.length === 0 && !loading && (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-6 py-16 text-center">
              <p className="text-2xl font-black text-white sm:text-3xl">Your favorites live here</p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
                Tap the heart on any channel to save it and jump straight back in.
              </p>
            </div>
          )}

          {source === DEFAULT_SOURCE && tab !== TAB_FAVORITES && !error && emptyVisible && (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-6 py-16 text-center">
              <p className="text-2xl font-black text-white sm:text-3xl">No channels found</p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">Try a different category or search term.</p>
            </div>
          )}

          {source === DEFAULT_SOURCE && !loading && !error && !emptyVisible && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {paged.map((ch) => (
                <LiveChannelCard key={ch.id} channel={ch} />
              ))}
            </div>
          )}

          {source === DEFAULT_SOURCE && !loading && !error && hasMore && (
            <div className="mt-9 flex justify-center">
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                className="rounded-xl border border-white/10 bg-white/[0.05] px-7 py-3 text-sm font-semibold text-white transition hover:border-brand/40 hover:bg-white/[0.09] focus:outline-none focus:ring-2 focus:ring-brand/50"
              >
                Load {Math.min(PAGE_SIZE, visible.length - shownCount)} more channels
              </button>
            </div>
          )}

          {source === DADDYLIVE_SOURCE && altVisible.length === 0 && (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-6 py-16 text-center">
              <p className="text-2xl font-black text-white sm:text-3xl">No channels found</p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">Try a different search term.</p>
            </div>
          )}

          {source === DADDYLIVE_SOURCE && altVisible.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {altVisible.map((ch) => (
                <LiveChannelCard
                  key={ch.id}
                  channel={ch}
                  to={`/live/daddylive/${encodeURIComponent(ch.id)}`}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}

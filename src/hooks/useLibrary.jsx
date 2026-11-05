import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import * as local from '../services/libraryService';
import {
  fetchCloudLibrary,
  upsertCloudWatchLater,
  deleteCloudWatchLater,
  upsertCloudHistory,
  deleteCloudHistory,
  clearCloudHistory,
  upsertCloudFavLive,
  deleteCloudFavLive,
  createCloudCollection,
  renameCloudCollection,
  deleteCloudCollection,
  moveCloudWatchLater,
} from '../services/cloudLibrary';
import { mergeWatchLater, mergeHistory, mergeFavoritesLive } from '../services/mergeLibrary';
import { getSupabase } from '../services/supabaseClient';
import {
  clearHistoryCache,
  clearPendingGuestLibrary,
  createPlayedEntry,
  hasPendingGuestLibrary,
  removeFavoritesLiveCache,
  removeHistoryCache,
  removeWatchLaterCache,
  replaceFavoritesLiveCache,
  replaceCollectionsCache,
  createLocalCollection,
  deleteLocalCollection,
  moveLocalWatchLater,
  replaceHistoryCache,
  replaceWatchLaterCache,
  saveToWatchLater,
  updateLocalCollection,
  upsertFavoritesLiveCache,
  upsertHistoryCache,
  upsertWatchLaterCache,
  withWatchProgress,
} from '../services/libraryService';

const MERGED_FLAG = 'flixhub.mergedToCloud';
const PROGRESS_DEBOUNCE_MS = 4000;

// Shared realtime channels: every useLibrary() instance (each MovieCard!)
// subscribes to the same per-user channel. Without this, N mounted cards = N
// identical `library:<userId>` channels, and React 18 StrictMode double-mounts
// effects in dev — the second .on() hits an already-subscribed channel and
// Supabase throws "cannot add postgres_changes callbacks after subscribe()",
// an uncaught error that blanked the whole page after sign-in.
const channelRegistry = new Map(); // userId -> { channel, reloads: Set, refCount }

function attachRealtime(userId, reload) {
  const sb = getSupabase();
  if (!sb || !userId) return () => {};
  let entry = channelRegistry.get(userId);
  if (!entry) {
    const reloads = new Set();
    const channel = sb.channel(`library:${userId}`);
    const fanOut = () => {
      reloads.forEach((fn) => {
        try { fn(); } catch { /* one bad listener must not break the rest */ }
      });
    };
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'watchlist_items', filter: `user_id=eq.${userId}` }, fanOut);
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'collections', filter: `user_id=eq.${userId}` }, fanOut);
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'history_items', filter: `user_id=eq.${userId}` }, fanOut);
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'favorites_live', filter: `user_id=eq.${userId}` }, fanOut);
    channel.subscribe();
    entry = { channel, reloads, refCount: 0 };
    channelRegistry.set(userId, entry);
  }
  entry.reloads.add(reload);
  entry.refCount += 1;
  return () => {
    const current = channelRegistry.get(userId);
    if (!current) return;
    current.reloads.delete(reload);
    current.refCount -= 1;
    if (current.refCount <= 0) {
      channelRegistry.delete(userId);
      try {
        getSupabase()?.removeChannel(current.channel);
      } catch { /* already gone */ }
    }
  };
}

function sortWatchLater(items) {
  return [...items].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

function sortHistory(items) {
  return [...items].sort((a, b) => (b.updatedAt || b.watchedAt || 0) - (a.updatedAt || a.watchedAt || 0));
}

function historyEntryKey(entry) {
  return `${entry?.movie?.id}|${entry?.season ?? 0}|${entry?.episode ?? 0}`;
}

/**
 * Hybrid library hook. Guests use localStorage exactly as before; signed-in
 * users read/write Supabase with a local mirror for instant UI updates.
 * On first sign-in, local items are merged up into the cloud once.
 */
import { createContext, useContext } from 'react';

const LibraryContext = createContext(null);

export function LibraryProvider({ children }) {
  const value = useLibraryState();
  return (
    <LibraryContext.Provider value={value}>
      {children}
      {value.libraryError && (
        <div
          role="alert"
          className="fixed bottom-4 left-4 right-4 z-[100] mx-auto flex max-w-lg items-center justify-between gap-4 rounded-lg border border-red-500/40 bg-ink-raised px-4 py-3 text-sm text-white shadow-xl"
        >
          <span>{value.libraryError}</span>
          <button type="button" onClick={value.dismissLibraryError} className="shrink-0 text-muted hover:text-white">
            Dismiss
          </button>
        </div>
      )}
    </LibraryContext.Provider>
  );
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary must be used within LibraryProvider');
  return ctx;
}
function useLibraryState() {
  const { user, isGuest } = useAuth();
  const userId = user?.id ?? null;
  const activeUserId = useRef(userId);
  const [watchLater, setWatchLater] = useState(() => local.getWatchLater());
  const [collections, setCollections] = useState(() => local.getCollections());
  const [history, setHistory] = useState(() => local.getHistory());
  const [favoritesLive, setFavoritesLive] = useState(() => local.getFavoritesLive());
  const [syncing, setSyncing] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const watchLaterRef = useRef(watchLater);
  const collectionsRef = useRef(collections);
  const historyRef = useRef(history);
  const favoritesLiveRef = useRef(favoritesLive);
  const progressTimer = useRef(null);
  const pendingProgress = useRef(new Map());

  watchLaterRef.current = watchLater;
  collectionsRef.current = collections;
  historyRef.current = history;
  favoritesLiveRef.current = favoritesLive;
  activeUserId.current = userId;

  const setWatchLaterValue = useCallback((items) => {
    const sorted = sortWatchLater(items);
    watchLaterRef.current = sorted;
    setWatchLater(sorted);
    return sorted;
  }, []);
  const setCollectionsValue = useCallback((items) => {
    collectionsRef.current = items;
    setCollections(items);
    return items;
  }, []);
  const setHistoryValue = useCallback((items) => {
    const sorted = sortHistory(items);
    historyRef.current = sorted;
    setHistory(sorted);
    return sorted;
  }, []);
  const setFavoritesLiveValue = useCallback((items) => {
    favoritesLiveRef.current = items;
    setFavoritesLive(items);
    return items;
  }, []);
  const applyCloudLibrary = useCallback((cloud) => {
    const nextWatchLater = setWatchLaterValue(cloud.watchLater);
    const nextCollections = setCollectionsValue(cloud.collections || []);
    const nextHistory = setHistoryValue(cloud.history);
    const nextFavoritesLive = setFavoritesLiveValue(cloud.favoritesLive);
    replaceWatchLaterCache(nextWatchLater);
    replaceCollectionsCache(nextCollections);
    replaceHistoryCache(nextHistory);
    replaceFavoritesLiveCache(nextFavoritesLive);
  }, [setWatchLaterValue, setCollectionsValue, setHistoryValue, setFavoritesLiveValue]);
  const showLibraryError = useCallback((message) => {
    setLibraryError(message);
  }, []);

  // Guest tabs stay live: re-read localStorage when another hook writes.
  useEffect(() => {
    if (userId) return;
    return local.subscribeLibrary(() => {
      setWatchLaterValue(local.getWatchLater());
      setCollectionsValue(local.getCollections());
      setHistoryValue(local.getHistory());
      setFavoritesLiveValue(local.getFavoritesLive());
    });
  }, [userId, setWatchLaterValue, setCollectionsValue, setHistoryValue, setFavoritesLiveValue]);

  // Cloud snapshots replace the mirror. Only explicitly marked guest data may
  // be merged, and only during the user's first successful cloud sync.
  useEffect(() => {
    if (!userId) {
      setWatchLaterValue(local.getWatchLater());
      setCollectionsValue(local.getCollections());
      setHistoryValue(local.getHistory());
      setFavoritesLiveValue(local.getFavoritesLive());
      setSyncing(false);
      return;
    }
    const guestLibrary = {
      watchLater: local.getWatchLater(),
      collections: local.getCollections(),
      history: local.getHistory(),
      favoritesLive: local.getFavoritesLive(),
      pending: hasPendingGuestLibrary(),
    };
    let cancelled = false;
    (async () => {
      setSyncing(true);
      try {
        const cloud = await fetchCloudLibrary(userId);
        if (cancelled) return;

        applyCloudLibrary(cloud);
        let flag = null;
        try { flag = localStorage.getItem(`${MERGED_FLAG}:${userId}`); } catch { /* ignore */ }
        if (!flag && guestLibrary.pending) {
          const collectionIdMap = new Map();
          const mergedCollections = [...cloud.collections];
          for (const guestCollection of guestLibrary.collections) {
            const existing = mergedCollections.find((collection) => collection.name === guestCollection.name);
            const cloudCollection = existing || await createCloudCollection(userId, guestCollection.name);
            if (cloudCollection) {
              collectionIdMap.set(guestCollection.id, cloudCollection.id);
              if (!existing) mergedCollections.push(cloudCollection);
            }
          }
          const mergedWL = mergeWatchLater(guestLibrary.watchLater, cloud.watchLater).map((entry) => {
            if (!entry.collectionId) return entry;
            const cloudCollectionId = collectionIdMap.get(entry.collectionId)
              || (cloud.collections.some((collection) => collection.id === entry.collectionId) ? entry.collectionId : null);
            return { ...entry, collectionId: cloudCollectionId };
          });
          const mergedHist = mergeHistory(guestLibrary.history, cloud.history);
          const mergedFav = mergeFavoritesLive(guestLibrary.favoritesLive, cloud.favoritesLive);
          await Promise.all([
            mergedWL.length ? upsertCloudWatchLater(userId, mergedWL) : Promise.resolve(),
            mergedHist.length ? upsertCloudHistory(userId, mergedHist) : Promise.resolve(),
            mergedFav.length ? upsertCloudFavLive(userId, mergedFav) : Promise.resolve(),
          ]);
          if (cancelled) return;
          applyCloudLibrary({ watchLater: mergedWL, collections: mergedCollections, history: mergedHist, favoritesLive: mergedFav });
          clearPendingGuestLibrary();
          try { localStorage.setItem(`${MERGED_FLAG}:${userId}`, String(Date.now())); } catch { /* ignore */ }
        } else if (!flag) {
          clearPendingGuestLibrary();
          try { localStorage.setItem(`${MERGED_FLAG}:${userId}`, String(Date.now())); } catch { /* ignore */ }
        }
      } catch (err) {
        console.error('[library] cloud sync failed', err);
        showLibraryError('Your library could not be synced. Please try again.');
      } finally {
        if (!cancelled) setSyncing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, applyCloudLibrary, showLibraryError, setWatchLaterValue, setCollectionsValue, setHistoryValue, setFavoritesLiveValue]);

  // Real-time: reflect writes from other devices on the same account.
  // One shared channel per user (see attachRealtime) — every hook instance
  // registers its reload fan-out instead of opening its own channel.
  useEffect(() => {
    if (!userId) return;
    let active = true;
    const reload = async () => {
      try {
        const cloud = await fetchCloudLibrary(userId);
        if (active) applyCloudLibrary(cloud);
      } catch (err) {
        console.warn('[library] realtime refresh failed', err);
      }
    };
    const detach = attachRealtime(userId, reload);
    return () => {
      active = false;
      detach();
    };
  }, [userId, applyCloudLibrary]);

  const flushProgress = useCallback(async () => {
    if (!userId || pendingProgress.current.size === 0) return;
    const batch = [...pendingProgress.current.entries()];
    const entries = batch
      .map(([, captured]) => captured.entry)
      .filter(Boolean);
    if (!entries.length) return;
    try {
      await upsertCloudHistory(userId, entries);
      if (activeUserId.current !== userId) return;
      const completed = batch
        .filter(([key, captured]) => pendingProgress.current.get(key)?.version === captured.version)
        .map(([, captured]) => captured.entry);
      completed.forEach(upsertHistoryCache);
      const current = historyRef.current;
      setHistoryValue(completed.reduce((items, entry) => {
        const key = historyEntryKey(entry);
        return [entry, ...items.filter((item) => `${item.movie?.id}|${item.season ?? 0}|${item.episode ?? 0}` !== key)];
      }, current));
      batch.forEach(([key, captured]) => {
        if (pendingProgress.current.get(key)?.version === captured.version) pendingProgress.current.delete(key);
      });
      if (pendingProgress.current.size) {
        clearTimeout(progressTimer.current);
        progressTimer.current = setTimeout(flushProgress, PROGRESS_DEBOUNCE_MS);
      }
    } catch (err) {
      if (activeUserId.current !== userId) return;
      console.error('[library] progress write failed', err);
      batch.forEach(([key, captured]) => {
        if (pendingProgress.current.get(key)?.version !== captured.version) return;
        const restored = historyRef.current.filter((entry) => `${entry.movie?.id}|${entry.season ?? 0}|${entry.episode ?? 0}` !== key);
        if (captured.previous) restored.push(captured.previous);
        setHistoryValue(restored);
        pendingProgress.current.delete(key);
      });
      if (pendingProgress.current.size) {
        clearTimeout(progressTimer.current);
        progressTimer.current = setTimeout(flushProgress, PROGRESS_DEBOUNCE_MS);
      }
    }
  }, [userId, setHistoryValue]);

  const toggleSaved = useCallback(
    async (movie) => {
      if (!movie?.id) return false;
      const current = watchLaterRef.current;
      const saved = current.some((e) => e?.movie?.id === movie.id);
      const next = !saved;
      const previous = current.find((e) => e?.movie?.id === movie.id);
      const entry = next ? { movie, savedAt: Date.now() } : null;
      const optimistic = next ? [entry, ...current] : current.filter((e) => e?.movie?.id !== movie.id);
      setWatchLaterValue(optimistic);
      if (!userId) {
        local.toggleWatchLater(movie);
        setWatchLaterValue(local.getWatchLater());
        return next;
      }
      try {
        if (next) {
          await upsertCloudWatchLater(userId, [entry]);
          if (activeUserId.current !== userId) return next;
          upsertWatchLaterCache(entry);
          setWatchLaterValue([entry, ...watchLaterRef.current.filter((item) => item?.movie?.id !== movie.id)]);
        }
        else {
          await deleteCloudWatchLater(userId, movie.id);
          if (activeUserId.current !== userId) return next;
          removeWatchLaterCache(movie.id);
          setWatchLaterValue(watchLaterRef.current.filter((item) => item?.movie?.id !== movie.id));
        }
      } catch (err) {
        if (activeUserId.current !== userId) return saved;
        console.error('[library] watchlist write failed', err);
        const rollback = watchLaterRef.current.filter((item) => item?.movie?.id !== movie.id);
        if (previous) rollback.push(previous);
        setWatchLaterValue(rollback);
        showLibraryError('Your watchlist change could not be saved.');
        return saved;
      }
      return next;
    },
    [userId, setWatchLaterValue, showLibraryError],
  );

  const saveToCollection = useCallback(async (movie, collectionId = null) => {
    if (!movie?.id) return false;
    if (collectionId && !collectionsRef.current.some((collection) => collection.id === collectionId)) return false;
    const previous = watchLaterRef.current.find((entry) => entry?.movie?.id === movie.id);
    const entry = {
      movie,
      savedAt: previous?.savedAt || Date.now(),
      collectionId: collectionId || null,
    };
    setWatchLaterValue([
      entry,
      ...watchLaterRef.current.filter((item) => item?.movie?.id !== movie.id),
    ]);
    if (!userId) {
      local.saveToWatchLater(movie, entry.collectionId);
      setWatchLaterValue(local.getWatchLater());
      return true;
    }
    try {
      await upsertCloudWatchLater(userId, [entry]);
      if (activeUserId.current !== userId) return true;
      upsertWatchLaterCache(entry);
      setWatchLaterValue([
        entry,
        ...watchLaterRef.current.filter((item) => item?.movie?.id !== movie.id),
      ]);
      return true;
    } catch (err) {
      if (activeUserId.current !== userId) return false;
      console.error('[library] watchlist collection save failed', err);
      setWatchLaterValue([
        ...watchLaterRef.current.filter((item) => item?.movie?.id !== movie.id),
        ...(previous ? [previous] : []),
      ]);
      showLibraryError('Your watchlist change could not be saved.');
      return false;
    }
  }, [userId, setWatchLaterValue, showLibraryError]);

  const createCollection = useCallback(async (name) => {
    const cleanName = name.trim();
    if (!cleanName) return null;
    try {
      const collection = userId
        ? await createCloudCollection(userId, cleanName)
        : createLocalCollection(cleanName);
      if (!collection) return null;
      const next = userId ? [collection, ...collectionsRef.current] : local.getCollections();
      setCollectionsValue(next);
      if (userId) replaceCollectionsCache(next);
      return collection;
    } catch (err) {
      console.error('[library] collection create failed', err);
      showLibraryError('Your collection could not be created.');
      return null;
    }
  }, [userId, setCollectionsValue, showLibraryError]);

  const renameCollection = useCallback(async (id, name) => {
    const cleanName = name.trim();
    if (!cleanName) return false;
    const previous = collectionsRef.current;
    if (!previous.some((collection) => collection.id === id)) return false;
    const next = previous.map((collection) => collection.id === id ? { ...collection, name: cleanName } : collection);
    setCollectionsValue(next);
    if (!userId) {
      updateLocalCollection(id, cleanName);
      return true;
    }
    try {
      await renameCloudCollection(userId, id, cleanName);
      if (activeUserId.current !== userId) return true;
      replaceCollectionsCache(next);
      return true;
    } catch (err) {
      if (activeUserId.current !== userId) return false;
      console.error('[library] collection rename failed', err);
      setCollectionsValue(previous);
      showLibraryError('Your collection could not be renamed.');
      return false;
    }
  }, [userId, setCollectionsValue, showLibraryError]);

  const deleteCollection = useCallback(async (id) => {
    const previousCollections = collectionsRef.current;
    const previousItems = watchLaterRef.current;
    if (!previousCollections.some((collection) => collection.id === id)) return false;
    setCollectionsValue(previousCollections.filter((collection) => collection.id !== id));
    const uncategorized = previousItems.map((entry) => (
      entry.collectionId === id ? { ...entry, collectionId: null } : entry
    ));
    setWatchLaterValue(uncategorized);
    if (!userId) {
      local.deleteLocalCollection(id);
      setWatchLaterValue(local.getWatchLater());
      return true;
    }
    try {
      await deleteCloudCollection(userId, id);
      if (activeUserId.current !== userId) return true;
      replaceCollectionsCache(collectionsRef.current);
      replaceWatchLaterCache(uncategorized);
      return true;
    } catch (err) {
      if (activeUserId.current !== userId) return false;
      console.error('[library] collection delete failed', err);
      setCollectionsValue(previousCollections);
      setWatchLaterValue(previousItems);
      showLibraryError('Your collection could not be deleted.');
      return false;
    }
  }, [userId, setCollectionsValue, setWatchLaterValue, showLibraryError]);

  const moveMovieToCollection = useCallback(async (watchlistItemId, collectionId = null) => {
    if (collectionId && !collectionsRef.current.some((collection) => collection.id === collectionId)) return false;
    const previousItems = watchLaterRef.current;
    const previous = previousItems.find((entry) => entry?.movie?.id === watchlistItemId);
    if (!previous) return false;
    const next = previousItems.map((entry) => (
      entry?.movie?.id === watchlistItemId ? { ...entry, collectionId: collectionId || null } : entry
    ));
    setWatchLaterValue(next);
    if (!userId) {
      local.moveLocalWatchLater(watchlistItemId, collectionId || null);
      return true;
    }
    try {
      await moveCloudWatchLater(userId, watchlistItemId, collectionId || null);
      if (activeUserId.current !== userId) return true;
      replaceWatchLaterCache(next);
      return true;
    } catch (err) {
      if (activeUserId.current !== userId) return false;
      console.error('[library] watchlist move failed', err);
      setWatchLaterValue(previousItems);
      showLibraryError('The movie could not be moved.');
      return false;
    }
  }, [userId, setWatchLaterValue, showLibraryError]);

  const removeSaved = useCallback(
    async (id) => {
      const previous = watchLaterRef.current.find((entry) => entry?.movie?.id === id);
      setWatchLaterValue(watchLaterRef.current.filter((entry) => entry?.movie?.id !== id));
      if (!userId) {
        local.removeFromWatchLater(id);
        return;
      }
      try {
        await deleteCloudWatchLater(userId, id);
        if (activeUserId.current !== userId) return;
        removeWatchLaterCache(id);
      } catch (err) {
        if (activeUserId.current !== userId) return;
        console.error('[library] watchlist delete failed', err);
        if (previous) setWatchLaterValue([...watchLaterRef.current, previous]);
        showLibraryError('Your watchlist item could not be removed.');
      }
    },
    [userId, setWatchLaterValue, showLibraryError],
  );

  const logPlayed = useCallback(
    async (movie, opts = {}) => {
      if (!userId) {
        local.logPlayed(movie, opts);
        setHistoryValue(local.getHistory());
        return;
      }
      const current = historyRef.current;
      const previous = current.filter((item) => item?.movie?.id === movie?.id
        && item.type === (opts.type || undefined) && item.season === opts.season && item.episode === opts.episode);
      const entry = createPlayedEntry(movie, opts, previous[0]);
      const key = historyEntryKey(entry);
      setHistoryValue([entry, ...current.filter((item) => historyEntryKey(item) !== key)]);
      try {
        await upsertCloudHistory(userId, [entry]);
        if (activeUserId.current !== userId) return;
        upsertHistoryCache(entry);
        setHistoryValue([entry, ...historyRef.current.filter((item) => historyEntryKey(item) !== key)]);
      } catch (err) {
        if (activeUserId.current !== userId) return;
        console.error('[library] history write failed', err);
        setHistoryValue([...historyRef.current.filter((item) => historyEntryKey(item) !== key), ...previous]);
        showLibraryError('Your watch history could not be saved.');
      }
    },
    [userId, setHistoryValue, showLibraryError],
  );

  const updateProgress = useCallback(
    (id, seconds, durationSeconds, opts = {}) => {
      if (!userId) {
        local.updateWatchProgress(id, seconds, durationSeconds, opts);
        setHistoryValue(local.getHistory());
        return;
      }
      const previousItems = historyRef.current;
      const { items, changed } = withWatchProgress(previousItems, id, seconds, durationSeconds, opts);
      if (!changed) return;
      const updated = items.find((entry) => entry.movie?.id === id
        && (opts.season == null || (entry.season === opts.season && entry.episode === opts.episode)));
      const key = historyEntryKey(updated);
      const pending = pendingProgress.current.get(key);
      pendingProgress.current.set(key, {
        previous: pending?.previous ?? previousItems.find((entry) => historyEntryKey(entry) === key),
        version: (pending?.version ?? 0) + 1,
        entry: updated,
      });
      setHistoryValue(items);
      clearTimeout(progressTimer.current);
      progressTimer.current = setTimeout(flushProgress, PROGRESS_DEBOUNCE_MS);
    },
    [userId, flushProgress, setHistoryValue],
  );

  const removeHistory = useCallback(
    async (id) => {
      const previous = historyRef.current.filter((entry) => entry?.movie?.id === id);
      setHistoryValue(historyRef.current.filter((entry) => entry?.movie?.id !== id));
      pendingProgress.current.forEach((_, key) => {
        if (key.startsWith(`${id}|`)) pendingProgress.current.delete(key);
      });
      if (!pendingProgress.current.size) clearTimeout(progressTimer.current);
      if (!userId) {
        local.removeFromHistory(id);
        return;
      }
      try {
        await deleteCloudHistory(userId, id);
        if (activeUserId.current !== userId) return;
        removeHistoryCache(id);
        pendingProgress.current.forEach((_, key) => {
          if (key.startsWith(`${id}|`)) pendingProgress.current.delete(key);
        });
      } catch (err) {
        if (activeUserId.current !== userId) return;
        console.error('[library] history delete failed', err);
        setHistoryValue([...historyRef.current, ...previous]);
        showLibraryError('Your history item could not be removed.');
      }
    },
    [userId, setHistoryValue, showLibraryError],
  );

  const clearAllHistory = useCallback(async () => {
    const previous = historyRef.current;
    setHistoryValue([]);
    clearTimeout(progressTimer.current);
    pendingProgress.current.clear();
    if (!userId) {
      local.clearHistory();
      return;
    }
    try {
      await clearCloudHistory(userId);
      if (activeUserId.current !== userId) return;
      clearHistoryCache();
      clearTimeout(progressTimer.current);
      pendingProgress.current.clear();
    } catch (err) {
    if (activeUserId.current !== userId) return;
    console.error('[library] history clear failed', err);
      setHistoryValue(previous);
      showLibraryError('Your watch history could not be cleared.');
    }
  }, [userId, setHistoryValue, showLibraryError]);

  const toggleFav = useCallback(
    async (channel) => {
      const key = channel?.id ?? channel?.name;
      if (key == null) return false;
      const current = favoritesLiveRef.current;
      const saved = current.some((e) => (e?.channel?.id ?? e?.channel?.name) === key);
      const next = !saved;
      const previous = current.find((e) => (e?.channel?.id ?? e?.channel?.name) === key);
      const entry = next ? { channel, savedAt: Date.now() } : null;
      const optimistic = next ? [entry, ...current] : current.filter((e) => (e?.channel?.id ?? e?.channel?.name) !== key);
      setFavoritesLiveValue(optimistic);
      if (!userId) {
        local.toggleFavLive(channel);
        setFavoritesLiveValue(local.getFavoritesLive());
        return next;
      }
      try {
        if (next) {
          await upsertCloudFavLive(userId, [entry]);
          if (activeUserId.current !== userId) return next;
          upsertFavoritesLiveCache(entry);
          setFavoritesLiveValue([entry, ...favoritesLiveRef.current.filter((item) => (item?.channel?.id ?? item?.channel?.name) !== key)]);
        }
        else {
          await deleteCloudFavLive(userId, key);
          if (activeUserId.current !== userId) return next;
          removeFavoritesLiveCache(key);
          setFavoritesLiveValue(favoritesLiveRef.current.filter((item) => (item?.channel?.id ?? item?.channel?.name) !== key));
        }
      } catch (err) {
        if (activeUserId.current !== userId) return saved;
        console.error('[library] favorites write failed', err);
        const rollback = favoritesLiveRef.current.filter((item) => (item?.channel?.id ?? item?.channel?.name) !== key);
        if (previous) rollback.push(previous);
        setFavoritesLiveValue(rollback);
        showLibraryError('Your live favorite could not be saved.');
        return saved;
      }
      return next;
    },
    [userId, setFavoritesLiveValue, showLibraryError],
  );

  useEffect(() => () => {
    clearTimeout(progressTimer.current);
    pendingProgress.current.clear();
  }, [userId]);

  return useMemo(
    () => ({
      isGuest,
      syncing,
      watchLater,
      collections,
      history,
      favoritesLive,
      libraryError,
      dismissLibraryError: () => setLibraryError(''),
      isSaved: (id) => watchLater.some((e) => e?.movie?.id === id),
      isFavLive: (id) => favoritesLive.some((e) => (e?.channel?.id ?? e?.channel?.name) === id),
      toggleSaved,
      saveToCollection,
      removeSaved,
      createCollection,
      renameCollection,
      deleteCollection,
      moveMovieToCollection,
      logPlayed,
      updateProgress,
      removeHistory,
      clearAllHistory,
      toggleFav,
    }),
    [isGuest, syncing, watchLater, collections, history, favoritesLive, libraryError, toggleSaved, saveToCollection, removeSaved, createCollection, renameCollection, deleteCollection, moveMovieToCollection, logPlayed, updateProgress, removeHistory, clearAllHistory, toggleFav],
  );
}

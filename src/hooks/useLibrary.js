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
} from '../services/cloudLibrary';
import { mergeWatchLater, mergeHistory, mergeFavoritesLive } from '../services/mergeLibrary';
import { getSupabase } from '../services/supabaseClient';

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

/**
 * Hybrid library hook. Guests use localStorage exactly as before; signed-in
 * users read/write Supabase with a local mirror for instant UI updates.
 * On first sign-in, local items are merged up into the cloud once.
 */
export function useLibrary() {
  const { user, isGuest } = useAuth();
  const userId = user?.id ?? null;
  const [watchLater, setWatchLater] = useState(() => local.getWatchLater());
  const [history, setHistory] = useState(() => local.getHistory());
  const [favoritesLive, setFavoritesLive] = useState(() => local.getFavoritesLive());
  const [syncing, setSyncing] = useState(false);
  const progressTimer = useRef(null);
  const pendingProgress = useRef(new Map());

  // Guest tabs stay live: re-read localStorage when another hook writes.
  useEffect(() => {
    if (userId) return;
    return local.subscribeLibrary(() => {
      setWatchLater(local.getWatchLater());
      setHistory(local.getHistory());
      setFavoritesLive(local.getFavoritesLive());
    });
  }, [userId]);

  // On sign-in: pull cloud, merge local up once, then serve cloud state.
  useEffect(() => {
    if (!userId) {
      setWatchLater(local.getWatchLater());
      setHistory(local.getHistory());
      setFavoritesLive(local.getFavoritesLive());
      return;
    }
    let cancelled = false;
    (async () => {
      setSyncing(true);
      try {
        const cloud = await fetchCloudLibrary(userId);
        if (cancelled) return;
        // Merge with the local mirror — never blindly trust a mid-write cloud read.
        // Our own upserts fire postgres_changes events, and a reload triggered by
        // e.g. the watchlist write can fetch history before its own upsert has
        // committed, which used to zero out the UI.
        setWatchLater(sortWatchLater(mergeWatchLater(local.getWatchLater(), cloud.watchLater)));
        setHistory(sortHistory(mergeHistory(local.getHistory(), cloud.history)));
        setFavoritesLive(mergeFavoritesLive(local.getFavoritesLive(), cloud.favoritesLive));
      } catch (err) {
        console.warn('[library] cloud sync failed, using local copy', err);
      } finally {
        try { flag = localStorage.getItem(`${MERGED_FLAG}:${userId}`); } catch { /* ignore */ }
        const hasLocal = local.getWatchLater().length || local.getHistory().length || local.getFavoritesLive().length;
        if (!flag && hasLocal) {
          const mergedWL = mergeWatchLater(local.getWatchLater(), cloud.watchLater);
          const mergedHist = mergeHistory(local.getHistory(), cloud.history);
          const mergedFav = mergeFavoritesLive(local.getFavoritesLive(), cloud.favoritesLive);
          await Promise.all([
            mergedWL.length ? upsertCloudWatchLater(userId, mergedWL) : Promise.resolve(),
            mergedHist.length ? upsertCloudHistory(userId, mergedHist) : Promise.resolve(),
            mergedFav.length ? upsertCloudFavLive(userId, mergedFav) : Promise.resolve(),
          ]);
          try { localStorage.setItem(`${MERGED_FLAG}:${userId}`, String(Date.now())); } catch { /* ignore */ }
        }
        if (!cancelled) setSyncing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Real-time: reflect writes from other devices on the same account.
  // One shared channel per user (see attachRealtime) — every hook instance
  // registers its reload fan-out instead of opening its own channel.
  useEffect(() => {
    if (!userId) return;
    const reload = async () => {
      try {
        const cloud = await fetchCloudLibrary(userId);
        // Merge with the local mirror — never blindly trust a mid-write cloud
        // read. Our own upserts fire postgres_changes events, and a reload
        // triggered by e.g. the watchlist write can fetch history before its
        // own upsert has committed, which used to zero out the UI.
        setWatchLater(sortWatchLater(mergeWatchLater(local.getWatchLater(), cloud.watchLater)));
        setHistory(sortHistory(mergeHistory(local.getHistory(), cloud.history)));
        setFavoritesLive(mergeFavoritesLive(local.getFavoritesLive(), cloud.favoritesLive));
      } catch { /* keep current state on transient errors */ }
    };
    return attachRealtime(userId, reload);
  }, [userId]);

  const flushProgress = useCallback(async () => {
    if (!userId || pendingProgress.current.size === 0) return;
    pendingProgress.current.clear();
    try {
      const cloud = await fetchCloudLibrary(userId);
      if (cloud.history.length) await upsertCloudHistory(userId, cloud.history);
    } catch { /* retried on next tick */ }
  }, [userId]);

  const toggleSaved = useCallback(
    async (movie) => {
      if (!movie?.id) return false;
      const saved = watchLater.some((e) => e?.movie?.id === movie.id);
      const next = !saved;
      const optimistic = next
        ? [{ movie, savedAt: Date.now() }, ...watchLater]
        : watchLater.filter((e) => e?.movie?.id !== movie.id);
      setWatchLater(optimistic);
      if (!userId) {
        local.toggleWatchLater(movie);
        setWatchLater(local.getWatchLater());
        return next;
      }
      try {
        if (next) await upsertCloudWatchLater(userId, optimistic.slice(0, 1));
        else await deleteCloudWatchLater(userId, movie.id);
      } catch (err) {
        console.warn('[library] watchlist write failed', err);
      }
      return next;
    },
    [userId, watchLater],
  );

  const removeSaved = useCallback(
    async (id) => {
      setWatchLater((prev) => prev.filter((e) => e?.movie?.id !== id));
      if (!userId) {
        local.removeFromWatchLater(id);
        return;
      }
      try {
        await deleteCloudWatchLater(userId, id);
      } catch (err) {
        console.warn('[library] watchlist delete failed', err);
      }
    },
    [userId],
  );

  const logPlayed = useCallback(
    async (movie, opts = {}) => {
      if (!userId) {
        local.logPlayed(movie, opts);
        setHistory(local.getHistory());
        return;
      }
      local.logPlayed(movie, opts);
      const entry = local.getHistory().find((e) => e?.movie?.id === movie?.id);
      setHistory((prev) => sortHistory([entry, ...prev.filter((e) => e?.movie?.id !== movie?.id)].filter(Boolean)));
      try {
        if (entry) await upsertCloudHistory(userId, [entry]);
      } catch (err) {
        console.warn('[library] history write failed', err);
      }
    },
    [userId],
  );

  const updateProgress = useCallback(
    (id, seconds, durationSeconds, opts = {}) => {
      local.updateWatchProgress(id, seconds, durationSeconds, opts);
      setHistory(local.getHistory());
      if (!userId) return;
      pendingProgress.current.set(String(id), true);
      clearTimeout(progressTimer.current);
      progressTimer.current = setTimeout(flushProgress, PROGRESS_DEBOUNCE_MS);
    },
    [userId, flushProgress],
  );

  const removeHistory = useCallback(
    async (id) => {
      setHistory((prev) => prev.filter((e) => e?.movie?.id !== id));
      if (!userId) {
        local.removeFromHistory(id);
        return;
      }
      try {
        await deleteCloudHistory(userId, id);
      } catch (err) {
        console.warn('[library] history delete failed', err);
      }
    },
    [userId],
  );

  const clearAllHistory = useCallback(async () => {
    setHistory([]);
    if (!userId) {
      local.clearHistory();
      return;
    }
    try {
      await clearCloudHistory(userId);
    } catch (err) {
      console.warn('[library] history clear failed', err);
    }
  }, [userId]);

  const toggleFav = useCallback(
    async (channel) => {
      const key = channel?.id ?? channel?.name;
      const saved = favoritesLive.some((e) => (e?.channel?.id ?? e?.channel?.name) === key);
      const next = !saved;
      const optimistic = next
        ? [{ channel, savedAt: Date.now() }, ...favoritesLive]
        : favoritesLive.filter((e) => (e?.channel?.id ?? e?.channel?.name) !== key);
      setFavoritesLive(optimistic);
      if (!userId) {
        local.toggleFavLive(channel);
        setFavoritesLive(local.getFavoritesLive());
        return next;
      }
      try {
        if (next) await upsertCloudFavLive(userId, optimistic.slice(0, 1));
        else await deleteCloudFavLive(userId, key);
      } catch (err) {
        console.warn('[library] favorites write failed', err);
      }
      return next;
    },
    [userId, favoritesLive],
  );

  return useMemo(
    () => ({
      isGuest,
      syncing,
      watchLater,
      history,
      favoritesLive,
      isSaved: (id) => watchLater.some((e) => e?.movie?.id === id),
      isFavLive: (id) => favoritesLive.some((e) => (e?.channel?.id ?? e?.channel?.name) === id),
      toggleSaved,
      removeSaved,
      logPlayed,
      updateProgress,
      removeHistory,
      clearAllHistory,
      toggleFav,
    }),
    [isGuest, syncing, watchLater, history, favoritesLive, toggleSaved, removeSaved, logPlayed, updateProgress, removeHistory, clearAllHistory, toggleFav],
  );
}



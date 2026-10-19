// ----------------------------------------------------------------------------
// Cloud library adapter (Supabase). Mirrors the localStorage entry shapes so
// UI code doesn't care where data lives. All functions no-op/empty when
// Supabase isn't configured or the user is a guest.
// ----------------------------------------------------------------------------

import { getSupabase } from './supabaseClient';
import { MAX_HISTORY } from './libraryService';

function toWatchLaterRow(userId, entry) {
  return {
    user_id: userId,
    media_id: String(entry.movie.id),
    media_type: entry.movie.media_type || 'movie',
    snapshot: entry.movie,
    saved_at: new Date(entry.savedAt || Date.now()).toISOString(),
  };
}

function fromWatchLaterRow(row) {
  return { movie: row.snapshot, savedAt: new Date(row.saved_at).getTime() };
}

function toHistoryRow(userId, entry) {
  return {
    user_id: userId,
    media_id: String(entry.movie.id),
    snapshot: entry.movie,
    progress_seconds: entry.progressSeconds || 0,
    duration_seconds: entry.durationSeconds || 0,
    type: entry.type || null,
    season: entry.season ?? null,
    episode: entry.episode ?? null,
    watched_at: new Date(entry.watchedAt || Date.now()).toISOString(),
    updated_at: new Date(entry.updatedAt || entry.watchedAt || Date.now()).toISOString(),
  };
}

function fromHistoryRow(row) {
  return {
    movie: row.snapshot,
    watchedAt: new Date(row.watched_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    progressSeconds: row.progress_seconds || 0,
    durationSeconds: row.duration_seconds || 0,
    type: row.type,
    season: row.season,
    episode: row.episode,
  };
}

function toFavLiveRow(userId, entry) {
  return {
    user_id: userId,
    channel_id: String(entry.channel?.id ?? entry.channel?.name ?? ''),
    snapshot: entry.channel,
    saved_at: new Date(entry.savedAt || Date.now()).toISOString(),
  };
}

function fromFavLiveRow(row) {
  return { channel: row.snapshot, savedAt: new Date(row.saved_at).getTime() };
}

export async function fetchCloudLibrary(userId) {
  const sb = getSupabase();
  if (!sb || !userId) return { watchLater: [], history: [], favoritesLive: [] };
  const [wl, hist, fav] = await Promise.all([
    sb.from('watchlist_items').select('*').eq('user_id', userId).order('saved_at', { ascending: false }),
    sb.from('history_items').select('*').eq('user_id', userId).order('updated_at', { ascending: false }).limit(MAX_HISTORY),
    sb.from('favorites_live').select('*').eq('user_id', userId).order('saved_at', { ascending: false }),
  ]);
  if (wl.error) throw wl.error;
  if (hist.error) throw hist.error;
  if (fav.error) throw fav.error;
  return {
    watchLater: (wl.data || []).map(fromWatchLaterRow),
    history: (hist.data || []).map(fromHistoryRow),
    favoritesLive: (fav.data || []).map(fromFavLiveRow),
  };
}

export async function upsertCloudWatchLater(userId, items) {
  const sb = getSupabase();
  if (!sb || !userId) return;
  if (!items.length) return;
  const { error } = await sb.from('watchlist_items').upsert(items.map((e) => toWatchLaterRow(userId, e)), { onConflict: 'user_id,media_id' });
  if (error) throw error;
}

export async function deleteCloudWatchLater(userId, mediaId) {
  const sb = getSupabase();
  if (!sb || !userId) return;
  const { error } = await sb.from('watchlist_items').delete().eq('user_id', userId).eq('media_id', String(mediaId));
  if (error) throw error;
}

export async function upsertCloudHistory(userId, items) {
  const sb = getSupabase();
  if (!sb || !userId) return;
  if (!items.length) return;
  const rows = items.slice(0, MAX_HISTORY).map((e) => toHistoryRow(userId, e));
  const { error } = await sb.from('history_items').upsert(rows, { onConflict: 'user_id,media_id,season,episode' });
  if (error) throw error;
}

export async function deleteCloudHistory(userId, mediaId) {
  const sb = getSupabase();
  if (!sb || !userId) return;
  const { error } = await sb.from('history_items').delete().eq('user_id', userId).eq('media_id', String(mediaId));
  if (error) throw error;
}

export async function clearCloudHistory(userId) {
  const sb = getSupabase();
  if (!sb || !userId) return;
  const { error } = await sb.from('history_items').delete().eq('user_id', userId);
  if (error) throw error;
}

export async function upsertCloudFavLive(userId, items) {
  const sb = getSupabase();
  if (!sb || !userId) return;
  if (!items.length) return;
  const { error } = await sb.from('favorites_live').upsert(items.map((e) => toFavLiveRow(userId, e)), { onConflict: 'user_id,channel_id' });
  if (error) throw error;
}

export async function deleteCloudFavLive(userId, channelId) {
  const sb = getSupabase();
  if (!sb || !userId) return;
  const { error } = await sb.from('favorites_live').delete().eq('user_id', userId).eq('channel_id', String(channelId));
  if (error) throw error;
}

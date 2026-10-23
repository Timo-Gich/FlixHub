// ----------------------------------------------------------------------------
// Merge guest (localStorage) library into cloud rows on first sign-in.
// Union by id; newest timestamp wins; progress keeps the max. Returns merged
// lists ready to upsert to Supabase.
// ----------------------------------------------------------------------------

function keyOfHistory(e) {
  return `${e.movie?.id}|${e.season ?? ''}|${e.episode ?? ''}`;
}

export function mergeWatchLater(localItems = [], cloudItems = []) {
  const map = new Map();
  for (const e of [...cloudItems, ...localItems]) {
    const id = e?.movie?.id;
    if (id == null || id === '') continue;
    const k = String(id);
    const prev = map.get(k);
    if (!prev || (e.savedAt || 0) > (prev.savedAt || 0)) map.set(k, e);
  }
  return [...map.values()].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

export function mergeHistory(localItems = [], cloudItems = []) {
  const map = new Map();
  for (const e of [...cloudItems, ...localItems]) {
    if (e?.movie?.id == null) continue;
    const k = keyOfHistory(e);
    const prev = map.get(k);
    if (!prev) {
      map.set(k, e);
      continue;
    }
    map.set(k, {
      ...e,
      progressSeconds: Math.max(e.progressSeconds || 0, prev.progressSeconds || 0),
      durationSeconds: e.durationSeconds || prev.durationSeconds || 0,
      watchedAt: Math.max(e.watchedAt || 0, prev.watchedAt || 0),
      updatedAt: Math.max(e.updatedAt || 0, prev.updatedAt || 0, e.watchedAt || 0, prev.watchedAt || 0),
    });
  }
  return [...map.values()]
    .sort((a, b) => (b.updatedAt || b.watchedAt || 0) - (a.updatedAt || a.watchedAt || 0))
    .slice(0, 200);
}

export function mergeFavoritesLive(localItems = [], cloudItems = []) {
  const map = new Map();
  for (const e of [...cloudItems, ...localItems]) {
    const k = String(e.channel?.id ?? e.channel?.name ?? '');
    if (!k) continue;
    const prev = map.get(k);
    if (!prev || (e.savedAt || 0) > (prev.savedAt || 0)) map.set(k, e);
  }
  return [...map.values()].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

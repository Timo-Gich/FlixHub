import { useEffect, useState } from 'react';
import { SERVERS } from '../services/servers';
import { fetchMovieExternalIds, fetchTVExternalIds } from '../services/tmdbService';

const PREF_KEY = 'preferredServer';
const DEFAULT_SERVER = 'server1';

function readPreferred(list) {
  const stored = localStorage.getItem(PREF_KEY);
  // Server 7 (Direct HLS) was removed — migrate anyone who had it saved.
  if (stored === 'server7') {
    localStorage.setItem(PREF_KEY, DEFAULT_SERVER);
    return DEFAULT_SERVER;
  }
  if (stored && list.some((s) => s.id === stored)) return stored;
  return list[0]?.id ?? DEFAULT_SERVER;
}

/**
 * Central logic for the embed server selector on movie / TV player pages.
 *
 * - Persists the user's favourite server under localStorage("preferredServer")
 *   (defaults to the first server in the list).
 * - Builds the active embed URL through the selected server's builder.
 *
 * @param {{
 *   type: 'movie'|'tv',
 *   id,
 *   season?, episode?,
 *   servers?: object[],     // optional server list override (e.g. IMDb-only)
 *   validateId?: boolean    // false → allow raw ids like "tt1234567"
 * }} args
 */
export default function useEmbedServer({
  type,
  id,
  season,
  episode,
  servers = SERVERS,
  validateId = true,
}) {
  const list = servers ?? SERVERS;

  const [preferred, setPreferred] = useState(() => readPreferred(list));
  const [imdbId, setImdbId] = useState(null);
  const [imdbLoading, setImdbLoading] = useState(false);

  // IMDb ids ("tt...") are not numeric, so skip numeric validation when `rawId`.
  const validId = validateId
    ? id != null && !Number.isNaN(Number(id))
    : id != null;
  const validSeason = season == null || !Number.isNaN(Number(season));
  const validEpisode = episode == null || !Number.isNaN(Number(episode));
  const idValidForType = type === 'tv' ? validSeason && validEpisode : true;

  // No server requires an IMDb id any more, so the /external_ids fetch is
  // skipped entirely (kept generic so it lights up again if one is added).
  const anyNeedsImdb = list.some((s) => s.usesImdb);

  // Persist the chosen server across sessions.
  useEffect(() => {
    localStorage.setItem(PREF_KEY, preferred);
  }, [preferred]);

  // Fetch (and cache) the IMDb id once per title — only needed by providers
  // flagged usesImdb (none today). Skipped to avoid a wasted API call.
  useEffect(() => {
    if (!validId || !type || !anyNeedsImdb) return;
    let active = true;
    setImdbLoading(true);
    const request =
      type === 'tv' ? fetchTVExternalIds(id) : fetchMovieExternalIds(id);
    request
      .then((res) => {
        if (!active) return;
        setImdbId(res?.imdb_id || null);
      })
      .catch(() => {
        if (active) setImdbId(null);
      })
      .finally(() => {
        if (active) setImdbLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, validId, id, anyNeedsImdb]);

  const requested = list.find((s) => s.id === preferred) ?? list[0];

  // If the persisted server needs an IMDb id that turned out to be unavailable,
  // gracefully fall back to the first server so the player still works.
  const server =
    requested.usesImdb && !imdbLoading && !imdbId ? list[0] : requested;

  let source = null;
  if (validId && idValidForType) {
    source =
      type === 'tv'
        ? server.tv(id, imdbId, season, episode)
        : server.movie(id, imdbId);
  }

  return {
    servers: list.map((s) => ({
      ...s,
      available: !s.usesImdb || (imdbLoading ? null : Boolean(imdbId)),
    })),
    activeServerId: server.id,
    selectServer: setPreferred,
    source,
    imdbId,
    imdbLoading,
  };
}
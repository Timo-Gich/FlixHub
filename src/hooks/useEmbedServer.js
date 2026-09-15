import { useEffect, useState } from 'react';
import { SERVERS } from '../services/servers';
import { fetchMovieExternalIds, fetchTVExternalIds } from '../services/tmdbService';

const PREF_KEY = 'preferredServer';
const DEFAULT_SERVER = 'server1';

function readPreferred() {
  const stored = localStorage.getItem(PREF_KEY);
  return !stored || !SERVERS.some((s) => s.id === stored) ? DEFAULT_SERVER : stored;
}

/**
 * Central logic for the embed server selector on movie / TV player pages.
 *
 * - Persists the user's favourite server under localStorage("preferredServer")
 *   (defaults to Server 1 / VidKing).
 * - Fetches the IMDb id once per title (only needed by Server 2 / VidSrc) via
 *   the TMDb /external_ids endpoint, and caches it in state so it is never
 *   refetched while we stay on the same title.
 * - Builds the active embed URL through the selected server's builder.
 *
 * @param {{ type: 'movie'|'tv', id, season?, episode? }} args
 */
export default function useEmbedServer({ type, id, season, episode }) {
  const [preferred, setPreferred] = useState(readPreferred);
  const [imdbId, setImdbId] = useState(null);
  const [imdbLoading, setImdbLoading] = useState(false);

  const validId = id != null && !Number.isNaN(Number(id));
  const validSeason = season == null || !Number.isNaN(Number(season));
  const validEpisode = episode == null || !Number.isNaN(Number(episode));
  const idValidForType = type === 'tv' ? validSeason && validEpisode : true;

  // Persist the chosen server across sessions.
  useEffect(() => {
    localStorage.setItem(PREF_KEY, preferred);
  }, [preferred]);

  // Fetch (and cache) the IMDb id exactly once per title. Server 2 (VidSrc) is
  // the only provider that needs it.
  useEffect(() => {
    if (!validId || !type) return;
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
  }, [type, validId, id]);

  const requested = SERVERS.find((s) => s.id === preferred) ?? SERVERS[0];

  // If the persisted server needs an IMDb id that turned out to be unavailable,
  // gracefully fall back to Server 1 so the player still works.
  const server =
    requested.usesImdb && !imdbLoading && !imdbId ? SERVERS[0] : requested;

  let source = null;
  if (validId && idValidForType) {
    if (server.usesImdb) {
      if (imdbId) {
        source =
          type === 'tv'
            ? server.tv(id, imdbId, season, episode)
            : server.movie(id, imdbId);
      }
    } else {
      source =
        type === 'tv'
          ? server.tv(id, imdbId, season, episode)
          : server.movie(id, imdbId);
    }
  }

  return {
    servers: SERVERS.map((s) => ({
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
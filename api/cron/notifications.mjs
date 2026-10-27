import { timingSafeEqual } from 'node:crypto';
import { getAdminClient, configureVapid, sendPushToUser } from '../_lib/push.mjs';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_TIMEOUT_MS = 12000;
const NOTIFICATION_TTL_DAYS = 30;
const RECENT_RELEASE_DAYS = 7;
const USER_BATCH_SIZE = 250;
const USER_CONCURRENCY = 4;

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

function isAuthorized(req) {
  const expected = process.env.CRON_SECRET || process.env.SECRET;
  if (!expected) return null;
  const match = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const actualBuffer = Buffer.from(match[1]);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

async function fetchTMDB(path, apiKey) {
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  url.searchParams.set('api_key', apiKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TMDB_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) {
      const error = new Error(`TMDb ${path} failed with HTTP ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTrackedDetails(path, id, apiKey) {
  try {
    return await fetchTMDB(`${path}/${encodeURIComponent(id)}`, apiKey);
  } catch (error) {
    if (error.status === 404) {
      console.warn(`[notifications cron] tracked TMDb title ${id} no longer exists`);
      return null;
    }
    throw error;
  }
}

function mediaType(entry) {
  return entry.type === 'tv' || entry.media_type === 'tv' || entry.snapshot?.media_type === 'tv' ? 'tv' : 'movie';
}

function titleOf(media) {
  return media.title || media.name || 'Untitled';
}

function mediaHref(media) {
  return media.media_type === 'tv' ? `/tv/${media.id}` : `/movie/${media.id}`;
}

function overlaps(left, right) {
  return (left || []).some((id) => (right || []).includes(id));
}

function dateWithinDays(value, days, now) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  const age = now.getTime() - timestamp;
  return age >= 0 && age <= days * 24 * 60 * 60 * 1000;
}

function makeCandidate(type, dedupeKey, title, body, href, tag = dedupeKey) {
  return {
    type,
    dedupe_key: dedupeKey,
    payload: { title, body, href, tag },
  };
}

async function buildUserCandidates(admin, userId, trending, apiKey, now) {
  const [watchlistResult, historyResult] = await Promise.all([
    admin.from('watchlist_items')
      .select('media_id, media_type, snapshot, saved_at')
      .eq('user_id', userId)
      .order('saved_at', { ascending: false })
      .limit(50),
    admin.from('history_items')
      .select('media_id, snapshot, type, season, episode, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(100),
  ]);
  if (watchlistResult.error) throw watchlistResult.error;
  if (historyResult.error) throw historyResult.error;

  const watchlist = watchlistResult.data || [];
  const history = historyResult.data || [];
  if (!watchlist.length && !history.length) return [];

  const knownIds = new Set([
    ...watchlist.map((entry) => String(entry.media_id)),
    ...history.map((entry) => String(entry.media_id)),
  ]);
  const preferredGenres = [...new Set(
    [...history, ...watchlist].flatMap((entry) => entry.snapshot?.genre_ids || []),
  )];
  const preferredMediaType = history.length
    ? mediaType(history[0])
    : (watchlist[0].media_type === 'tv' ? 'tv' : 'movie');

  const candidates = [];
  const week = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  week.setUTCDate(week.getUTCDate() - week.getUTCDay());
  const weekKey = week.toISOString().slice(0, 10);
  const trendingItem = (trending.results || [])
    .filter((item) => item?.id && item.media_type !== 'person' && !knownIds.has(String(item.id)))
    .filter((item) => preferredGenres.length
      ? overlaps(item.genre_ids, preferredGenres)
      : item.media_type === preferredMediaType)
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))[0];

  if (trendingItem) {
    const type = trendingItem.media_type === 'tv' ? 'tv' : 'movie';
    const id = String(trendingItem.id);
    candidates.push(makeCandidate(
      'trending',
      `trending:${weekKey}:${type}:${id}`,
      `${titleOf(trendingItem)} is trending`,
      preferredGenres.length
        ? 'Trending now in genres you watch.'
        : 'A popular pick matching the kind of titles you watch.',
      mediaHref({ ...trendingItem, media_type: type }),
    ));
  }

  const recentEntry = history.find((entry) => entry.media_id && entry.snapshot);
  if (recentEntry) {
    const type = mediaType(recentEntry);
    const titleId = String(recentEntry.media_id);
    let recommendations = { results: [] };
    try {
      recommendations = await fetchTMDB(`/${type}/${encodeURIComponent(titleId)}/recommendations`, apiKey);
    } catch (error) {
      if (error.status !== 404) throw error;
      console.warn(`[notifications cron] recommendation source ${titleId} no longer exists`);
    }
    const recommendation = (recommendations.results || [])
      .filter((item) => item?.id && !knownIds.has(String(item.id)))
      .sort((a, b) => {
        const genreDifference = Number(overlaps(b.genre_ids, preferredGenres)) - Number(overlaps(a.genre_ids, preferredGenres));
        return genreDifference || (b.vote_average || 0) - (a.vote_average || 0);
      })[0];
    if (recommendation) {
      const recommendedType = type;
      const id = String(recommendation.id);
      candidates.push(makeCandidate(
        'recommendation',
        `recommendation:${recommendedType}:${id}`,
        `Picked for you: ${titleOf(recommendation)}`,
        `Because you watched ${titleOf(recentEntry.snapshot)}.`,
        mediaHref({ ...recommendation, media_type: recommendedType }),
      ));
    }
  }

  const watchedEpisodeByShow = new Map();
  const trackedShows = new Set();
  for (const entry of history) {
    if (mediaType(entry) !== 'tv') continue;
    const id = String(entry.media_id);
    const episode = { season: Number(entry.season) || 0, episode: Number(entry.episode) || 0 };
    const previous = watchedEpisodeByShow.get(id);
    if (!previous || episode.season > previous.season
      || (episode.season === previous.season && episode.episode > previous.episode)) {
      watchedEpisodeByShow.set(id, episode);
    }
    trackedShows.add(id);
  }
  for (const entry of watchlist) {
    if (entry.media_type === 'tv') trackedShows.add(String(entry.media_id));
  }

  const releaseCandidates = [];
  const showIds = [...trackedShows].slice(0, 5);
  const showDetails = (await Promise.all(showIds.map((id) => fetchTrackedDetails('/tv', id, apiKey))))
    .filter(Boolean);
  for (const show of showDetails) {
    const episode = show.last_episode_to_air;
    if (!episode?.air_date || !dateWithinDays(episode.air_date, RECENT_RELEASE_DAYS, now)) continue;
    const watched = watchedEpisodeByShow.get(String(show.id));
    if (watched && (episode.season_number < watched.season
      || (episode.season_number === watched.season && episode.episode_number <= watched.episode))) continue;
    const season = Number(episode.season_number) || 0;
    const episodeNumber = Number(episode.episode_number) || 0;
    if (!season || !episodeNumber) continue;
    releaseCandidates.push({
      date: episode.air_date,
      candidate: makeCandidate(
        'new_release',
        `new-release:tv:${show.id}:s${season}e${episodeNumber}`,
        `New episode: ${titleOf(show)}`,
        `Season ${season}, episode ${episodeNumber} aired recently.`,
        `/watch/tv/${show.id}/${season}/${episodeNumber}`,
      ),
    });
  }

  const moviesToCheck = watchlist
    .filter((entry) => entry.media_type !== 'tv')
    .slice(0, 3);
  const movieDetails = (await Promise.all(moviesToCheck.map((entry) => (
    fetchTrackedDetails('/movie', entry.media_id, apiKey)
  )))).filter(Boolean);
  for (const movie of movieDetails) {
    if (!dateWithinDays(movie.release_date, RECENT_RELEASE_DAYS, now)) continue;
    releaseCandidates.push({
      date: movie.release_date,
      candidate: makeCandidate(
        'new_release',
        `new-release:movie:${movie.id}:${movie.release_date}`,
        `Now released: ${titleOf(movie)}`,
        'A movie on your watchlist was recently released.',
        mediaHref({ ...movie, media_type: 'movie' }),
      ),
    });
  }

  candidates.push(...releaseCandidates
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)
    .map(({ candidate }) => candidate));
  return candidates;
}

async function getEnabledSettings(admin) {
  const settings = [];
  for (let offset = 0; ; offset += USER_BATCH_SIZE) {
    const { data, error } = await admin.from('notification_settings')
      .select('user_id, notifications_enabled, browser_enabled')
      .eq('notifications_enabled', true)
      .range(offset, offset + USER_BATCH_SIZE - 1);
    if (error) throw error;
    settings.push(...(data || []));
    if (!data || data.length < USER_BATCH_SIZE) break;
  }
  return settings;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed.' });
  }

  const authorized = isAuthorized(req);
  if (authorized === null) return json(res, 503, { error: 'CRON_SECRET is not configured on the server.' });
  if (!authorized) return json(res, 401, { error: 'Unauthorized.' });

  let admin;
  try {
    admin = getAdminClient();
  } catch (error) {
    console.error('[notifications cron] server credentials are not configured', error);
    return json(res, 503, { error: 'Notification database credentials are not configured.' });
  }

  const cleanup = await admin.from('notifications').delete().lt('expires_at', new Date().toISOString());
  if (cleanup.error) return json(res, 500, { error: 'Could not clean up expired notifications.' });

  let settings;
  try {
    settings = await getEnabledSettings(admin);
  } catch (error) {
    console.error('[notifications cron] could not load user settings', error);
    return json(res, 500, { error: 'Could not load notification preferences.' });
  }
  if (!settings.length) return json(res, 200, { ok: true, users: 0, inserted: 0, pushed: 0 });

  if (settings.some((entry) => entry.browser_enabled)) {
    try {
      configureVapid();
    } catch (error) {
      console.error('[notifications cron] VAPID configuration is invalid', error);
      return json(res, 503, { error: 'Web Push is enabled for users, but VAPID configuration is missing or invalid.' });
    }
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return json(res, 503, { error: 'TMDB_API_KEY is not configured on the server.' });

  let trending;
  try {
    trending = await fetchTMDB('/trending/all/day', apiKey);
  } catch (error) {
    console.error('[notifications cron] could not load trending titles', error);
    return json(res, 502, { error: 'Could not load current titles from TMDb.' });
  }

  let totalInserted = 0;
  let totalPushed = 0;
  let pushFailures = 0;
  let candidateFailures = 0;
  const expiresAt = new Date(Date.now() + NOTIFICATION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  for (let offset = 0; offset < settings.length; offset += USER_CONCURRENCY) {
    const batch = settings.slice(offset, offset + USER_CONCURRENCY);
    await Promise.all(batch.map(async (setting) => {
      let candidates;
      try {
        candidates = await buildUserCandidates(admin, setting.user_id, trending, apiKey, new Date());
      } catch (error) {
        candidateFailures++;
        console.error(`[notifications cron] candidate generation failed for user ${setting.user_id}`, error);
        return;
      }

      for (const candidate of candidates) {
        const { data: inserted, error } = await admin.from('notifications')
          .upsert(
            { user_id: setting.user_id, ...candidate, expires_at: expiresAt },
            { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true },
          )
          .select('id')
          .maybeSingle();
        if (error) {
          console.error(`[notifications cron] could not save ${candidate.type} notification`, error);
          candidateFailures++;
          continue;
        }
        if (!inserted) continue;
        totalInserted++;

        if (setting.browser_enabled) {
          try {
            const result = await sendPushToUser(admin, setting.user_id, {
              title: candidate.payload.title,
              body: candidate.payload.body,
              url: candidate.payload.href,
              tag: candidate.payload.tag,
            });
            totalPushed += result.sent;
            pushFailures += result.failed;
          } catch (error) {
            pushFailures++;
            console.error(`[notifications cron] push failed for user ${setting.user_id}`, error);
          }
        }
      }
    }));
  }

  return json(res, candidateFailures ? 207 : 200, {
    ok: candidateFailures === 0,
    users: settings.length,
    inserted: totalInserted,
    pushed: totalPushed,
    pushFailures,
    candidateFailures,
  });
}

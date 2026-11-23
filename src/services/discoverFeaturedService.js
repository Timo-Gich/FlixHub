import {
  discoverTitles,
  fetchMovieDetails,
  fetchTVDetails,
} from './tmdbService';

const FEATURED_STORAGE_PREFIX = 'flixhub.discoverFeatured.';
const SURPRISE_STORAGE_KEY = 'flixhub.discoverSurprise';
const FEATURED_HISTORY_DAYS = 30;
const MAX_FEATURED_HISTORY = 60;

const emptyStore = () => ({ featured: null, recent: [], popularitySnapshots: [] });

function storageKey(scopeKey) {
  return `${FEATURED_STORAGE_PREFIX}${scopeKey}`;
}

function readStore(scopeKey) {
  const key = storageKey(scopeKey);
  const raw = localStorage.getItem(key);
  if (!raw) return emptyStore();

  try {
    const saved = JSON.parse(raw);
    return {
      featured: saved?.featured ?? null,
      recent: Array.isArray(saved?.recent) ? saved.recent : [],
      popularitySnapshots: Array.isArray(saved?.popularitySnapshots)
        ? saved.popularitySnapshots
        : [],
    };
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    localStorage.removeItem(key);
    return emptyStore();
  }
}

export function getDiscoverDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function readDailyFeatured(dayKey, scopeKey) {
  const featured = readStore(scopeKey).featured;
  return featured?.day === dayKey
    && featured.movie?.id != null
    && (featured.movie.media_type === 'movie' || featured.movie.media_type === 'tv')
    ? featured
    : null;
}

function dayDistance(dayKey, earlierDayKey) {
  const current = Date.parse(`${dayKey}T00:00:00Z`);
  const earlier = Date.parse(`${earlierDayKey}T00:00:00Z`);
  return Number.isFinite(current) && Number.isFinite(earlier)
    ? Math.floor((current - earlier) / 86400000)
    : Infinity;
}

function mediaKey(movie) {
  return movie?.id == null ? null : `${movie.media_type}-${movie.id}`;
}

function historyMediaType(entry, movie) {
  return entry?.type === 'tv'
    || movie?.media_type === 'tv'
    || (movie?.name && !movie?.title)
    ? 'tv'
    : 'movie';
}

function libraryExposureIds(history, watchLater) {
  const ids = new Set();
  [...history, ...watchLater].forEach((entry) => {
    const movie = entry?.movie ?? entry;
    const key = mediaKey({
      id: movie?.id,
      media_type: historyMediaType(entry, movie),
    });
    if (key) ids.add(key);
  });

  const surpriseRaw = localStorage.getItem(SURPRISE_STORAGE_KEY);
  if (surpriseRaw) {
    try {
      const surprise = JSON.parse(surpriseRaw);
      const key = mediaKey(surprise);
      if (key) ids.add(key);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }

  return ids;
}

function recentFeatured(store, dayKey) {
  return store.recent.filter((entry) => {
    const age = dayDistance(dayKey, entry.day);
    return age >= 0 && age < FEATURED_HISTORY_DAYS;
  });
}

function withMediaType(items, mediaType) {
  return (items ?? []).map((item) => ({ ...item, media_type: mediaType }));
}

async function fetchCuratedCandidates(dayKey) {
  const firstReleaseYear = Number(dayKey.slice(0, 4)) - 10;
  const queries = ['movie', 'tv'].flatMap((mediaType) => {
    const dateField = mediaType === 'tv' ? 'first_air_date' : 'primary_release_date';
    const filters = {
      'vote_average.gte': '7',
      'vote_count.gte': '100',
      'popularity.gte': '5',
      'popularity.lte': '80',
      [`${dateField}.gte`]: `${firstReleaseYear}-01-01`,
      [`${dateField}.lte`]: dayKey,
      sort_by: 'popularity.desc',
    };

    return [1, 2].map((page) =>
      discoverTitles(mediaType, filters, { page }).then((response) =>
        withMediaType(response.results, mediaType)));
  });

  const results = await Promise.allSettled(queries);
  const fulfilled = results.filter((result) => result.status === 'fulfilled');
  if (fulfilled.length === 0) {
    throw results.find((result) => result.status === 'rejected').reason;
  }
  return fulfilled.flatMap((result) => result.value);
}

function latestHistorySources(history) {
  const seen = new Set();
  return [...history]
    .filter((entry) => entry?.movie?.id != null)
    .sort((a, b) => (b.updatedAt || b.watchedAt || 0) - (a.updatedAt || a.watchedAt || 0))
    .filter((entry) => {
      const movie = entry.movie;
      const key = mediaKey({
        id: movie.id,
        media_type: historyMediaType(entry, movie),
      });
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

async function fetchPersonalizedCandidates(history) {
  const sources = latestHistorySources(history);
  if (sources.length === 0) return [];

  const results = await Promise.allSettled(sources.map(async (entry) => {
    const mediaType = historyMediaType(entry, entry.movie);
    const details = mediaType === 'tv'
      ? await fetchTVDetails(entry.movie.id)
      : await fetchMovieDetails(entry.movie.id);
    return withMediaType(details.recommendations?.results, mediaType);
  }));
  const candidates = results
    .filter((result) => result.status === 'fulfilled')
    .flatMap((result) => result.value);

  if (candidates.length === 0 && results.some((result) => result.status === 'rejected')) {
    throw new Error('Personalized recommendations could not be loaded.');
  }
  return candidates;
}

function isEligible(movie, dayKey) {
  const popularity = Number(movie.popularity);
  const rating = Number(movie.vote_average);
  const votes = Number(movie.vote_count);
  const releaseDate = movie.release_date ?? movie.first_air_date;

  return Number.isFinite(popularity)
    && popularity >= 5
    && popularity <= 80
    && rating >= 7
    && votes >= 100
    && (!releaseDate || releaseDate <= dayKey);
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function scoreCandidate(movie, dayKey, recent, popularitySnapshots) {
  const popularity = Number(movie.popularity);
  const rating = Number(movie.vote_average);
  const confidence = Math.min(Number(movie.vote_count) / 1000, 1);
  const releaseDate = movie.release_date ?? movie.first_air_date;
  const releaseAge = releaseDate
    ? Math.max(0, (Date.parse(`${dayKey}T00:00:00Z`) - Date.parse(`${releaseDate}T00:00:00Z`)) / 86400000 / 365.25)
    : 10;
  const freshness = Math.max(0, 1 - releaseAge / 10);
  const recentGenreCounts = new Map();
  recent.forEach((entry) => {
    (entry.genres ?? []).forEach((genreId) => {
      recentGenreCounts.set(genreId, (recentGenreCounts.get(genreId) ?? 0) + 1);
    });
  });
  const genres = movie.genre_ids ?? [];
  const genreNovelty = genres.length
    ? genres.reduce((sum, id) => sum + 1 / (1 + (recentGenreCounts.get(id) ?? 0)), 0) / genres.length
    : 0.4;
  const popularityFit = Math.max(0, 1 - Math.abs(popularity - 32) / 50);
  // TMDb has no growth metric, so use saved daily scores as a momentum proxy.
  const previousSnapshot = popularitySnapshots
    .filter((snapshot) => {
      const age = dayDistance(dayKey, snapshot.day);
      return age > 0 && age < FEATURED_HISTORY_DAYS;
    })
    .sort((a, b) => dayDistance(dayKey, a.day) - dayDistance(dayKey, b.day))[0];
  const previousPopularity = Number(previousSnapshot?.values?.[mediaKey(movie)]);
  const popularityMomentum = Number.isFinite(previousPopularity)
    ? Math.max(0, Math.min(1, 0.5 + ((popularity - previousPopularity) / Math.max(previousPopularity, 5)) * 1.25))
    : 0.5;
  const dailyTieBreak = hashString(`${dayKey}:${mediaKey(movie)}`) / 0xffffffff;

  return (rating / 10) * 0.3
    + confidence * 0.1
    + popularityFit * 0.15
    + popularityMomentum * 0.15
    + freshness * 0.15
    + genreNovelty * 0.1
    + dailyTieBreak * 0.05;
}

function saveFeatured(
  scopeKey,
  store,
  dayKey,
  movie,
  source,
  recent,
  personalizedUnavailable,
  popularitySnapshot,
) {
  const record = {
    day: dayKey,
    movie,
    source,
    personalizedUnavailable,
  };
  const selectedKey = mediaKey(movie);
  const history = [
    { day: dayKey, id: selectedKey, genres: movie.genre_ids ?? [] },
    ...recent.filter((entry) => entry.id !== selectedKey),
  ].slice(0, MAX_FEATURED_HISTORY);

  localStorage.setItem(storageKey(scopeKey), JSON.stringify({
    featured: record,
    recent: history,
    popularitySnapshots: [
      { day: dayKey, values: popularitySnapshot },
      ...store.popularitySnapshots.filter((snapshot) => {
        const age = dayDistance(dayKey, snapshot.day);
        return age > 0 && age < FEATURED_HISTORY_DAYS;
      }),
    ].slice(0, FEATURED_HISTORY_DAYS),
  }));
  return record;
}

export async function selectDailyFeatured({ dayKey, history, watchLater, scopeKey }) {
  const saved = readDailyFeatured(dayKey, scopeKey);
  if (saved) return saved;

  const [curatedResult, personalizedResult] = await Promise.allSettled([
    fetchCuratedCandidates(dayKey),
    fetchPersonalizedCandidates(history),
  ]);
  if (curatedResult.status === 'rejected' && personalizedResult.status === 'rejected') {
    throw curatedResult.reason;
  }

  const curated = curatedResult.status === 'fulfilled' ? curatedResult.value : [];
  const personalized = personalizedResult.status === 'fulfilled' ? personalizedResult.value : [];
  const eligibleCurated = curated.filter((movie) => isEligible(movie, dayKey));
  const eligiblePersonalized = personalized.filter((movie) => isEligible(movie, dayKey));
  if (eligibleCurated.length === 0 && eligiblePersonalized.length === 0) {
    if (curatedResult.status === 'rejected') throw curatedResult.reason;
    if (personalizedResult.status === 'rejected') throw personalizedResult.reason;
    throw new Error('No suitable featured titles are available right now.');
  }

  const store = readStore(scopeKey);
  const recent = recentFeatured(store, dayKey);
  const libraryExposures = libraryExposureIds(history, watchLater);
  const allCandidates = [...eligibleCurated, ...eligiblePersonalized];
  const unseenByLibrary = allCandidates.filter((movie) => !libraryExposures.has(mediaKey(movie)));
  const baseCandidates = unseenByLibrary.length ? unseenByLibrary : allCandidates;
  const recentlyFeaturedIds = new Set(recent.map((entry) => entry.id));
  const notRecentlyFeatured = baseCandidates.filter(
    (movie) => !recentlyFeaturedIds.has(mediaKey(movie)),
  );
  const candidates = notRecentlyFeatured.length ? notRecentlyFeatured : baseCandidates;

  const curatedIds = new Set(eligibleCurated.map(mediaKey));
  const personalizedIds = new Set(eligiblePersonalized.map(mediaKey));
  const popularitySnapshot = Object.fromEntries(
    allCandidates.map((movie) => [mediaKey(movie), Number(movie.popularity)]),
  );
  const category = hashString(dayKey) % 2 === 0 ? 'curated' : 'personalized';
  const pools = {
    curated: candidates.filter((movie) => curatedIds.has(mediaKey(movie))),
    personalized: candidates.filter((movie) => personalizedIds.has(mediaKey(movie))),
  };
  const source = pools[category].length
    ? category
    : (category === 'curated' ? 'personalized' : 'curated');
  const selectedPool = pools[source].length ? pools[source] : candidates;
  const selected = selectedPool
    .map((movie) => ({
      movie,
      score: scoreCandidate(movie, dayKey, recent, store.popularitySnapshots),
    }))
    .reduce((best, entry) => !best || entry.score > best.score ? entry : best, null)?.movie;

  return {
    day: dayKey,
    movie: selected,
    source,
    popularitySnapshot,
    personalizedUnavailable: personalizedResult.status === 'rejected'
      && latestHistorySources(history).length > 0,
  };
}

export function persistDailyFeatured(selection, scopeKey) {
  const store = readStore(scopeKey);
  const recent = recentFeatured(store, selection.day);
  return saveFeatured(
    scopeKey,
    store,
    selection.day,
    selection.movie,
    selection.source,
    recent,
    selection.personalizedUnavailable,
    selection.popularitySnapshot,
  );
}

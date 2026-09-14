import MovieCard from './MovieCard';

/**
 * Horizontally-scrollable "carousel" of suggested titles (TMDb recommendations).
 * Reuses MovieCard, which routes movies to /movie/:id and TV shows to /tv/:id
 * automatically, so the same row works for both detail-page types.
 *
 * Props:
 *   - title : section heading (e.g. "Similar Movies" / "Similar Shows")
 *   - items : array of TMDb recommendation objects
 */
export default function RecommendationsRow({ title = 'More Like This', items = [] }) {
  const list = (items ?? []).filter((item) => item.id != null).slice(0, 20);
  if (list.length === 0) return null;

  return (
    <section aria-label={title} className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-8">
      <h2 className="mb-4 text-lg font-bold text-white md:text-xl">{title}</h2>

      <div className="scrollbar-hide -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:-mx-8 sm:px-8">
        {list.map((item) => (
          <div key={`${item.media_type ?? 'movie'}-${item.id}`} className="w-[150px] shrink-0 snap-start sm:w-[180px]">
            <MovieCard movie={item} />
          </div>
        ))}
      </div>
    </section>
  );
}
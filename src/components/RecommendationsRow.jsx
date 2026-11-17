import MovieCard from './MovieCard';
import SectionHeading from './SectionHeading';

/**
 * Horizontally-scrollable "carousel" of suggested titles (TMDb recommendations).
 * Reuses MovieCard, which routes movies to /movie/:id and TV shows to /tv/:id
 * automatically, so the same row works for both detail-page types.
 *
 * Props:
 *   - title : section heading (e.g. "Similar Movies" / "Similar Shows")
 *   - items : array of TMDb recommendation objects
 */
export default function RecommendationsRow({ title = 'More Like This', items = [], grid = false }) {
  const filteredItems = (items ?? []).filter((item) => item.id != null);
  const list = grid ? filteredItems : filteredItems.slice(0, 20);
  if (list.length === 0) return null;

  return (
    <section aria-label={title} className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-8">
      <SectionHeading className="mb-4 text-xl md:text-2xl">{title}</SectionHeading>

      <div
        className={grid
          ? 'grid grid-cols-2 gap-3 py-2 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
          : 'scrollbar-hide -mx-4 flex gap-3 overflow-x-auto px-4 py-8 sm:-mx-8 sm:px-8'}
      >
        {list.map((item) => (
          <div
            key={`${item.media_type ?? 'movie'}-${item.id}`}
            className={grid ? 'min-w-0' : 'w-[150px] shrink-0 snap-start sm:w-[180px]'}
          >
            <MovieCard movie={item} />
          </div>
        ))}
      </div>
    </section>
  );
}